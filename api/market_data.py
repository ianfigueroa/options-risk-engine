"""Market data adapters for public quote lookups."""

from __future__ import annotations

import copy
import os
import threading
import time
from datetime import UTC, date, datetime, timedelta
from typing import Any, Callable, Hashable, TypeVar


T = TypeVar("T")
YAHOO_MIN_REQUEST_INTERVAL_SECONDS = float(os.getenv("OPTIONS_YAHOO_MIN_INTERVAL_SECONDS", "2.5"))
MARKET_SNAPSHOT_TTL_SECONDS = float(os.getenv("OPTIONS_MARKET_SNAPSHOT_TTL_SECONDS", "60"))
OPTION_QUOTE_TTL_SECONDS = float(os.getenv("OPTIONS_OPTION_QUOTE_TTL_SECONDS", "120"))
OPTION_CHAIN_TTL_SECONDS = float(os.getenv("OPTIONS_OPTION_CHAIN_TTL_SECONDS", "300"))
_yahoo_lock = threading.Lock()
_last_yahoo_request = 0.0


class TtlCache:
    """Small in-process TTL cache for live market data responses."""

    def __init__(self, now: Callable[[], float] = time.monotonic):
        self._now = now
        self._lock = threading.RLock()
        self._values: dict[tuple[Hashable, ...], tuple[float, Any]] = {}

    def get_or_load(self, key: tuple[Hashable, ...], ttl_seconds: float, loader: Callable[[], T]) -> T:
        now = self._now()
        with self._lock:
            cached = self._values.get(key)
            if cached is not None and now - cached[0] <= ttl_seconds:
                return copy.deepcopy(cached[1])

        value = loader()
        with self._lock:
            self._values[key] = (self._now(), copy.deepcopy(value))
        return copy.deepcopy(value)


_live_cache = TtlCache()


def fetch_market_snapshot(ticker: str) -> dict[str, Any]:
    """Fetch a compact stock quote snapshot from Yahoo Finance via yfinance."""
    symbol = ticker.upper()
    return _live_cache.get_or_load(
        ("snapshot", symbol),
        MARKET_SNAPSHOT_TTL_SECONDS,
        lambda: _fetch_market_snapshot_uncached(symbol),
    )


def fetch_nearest_option_quote(ticker: str, kind: str, strike: float, expiry_years: float) -> dict[str, Any]:
    """Fetch the closest listed option quote for a target strike and expiry."""
    symbol = ticker.upper()
    rounded_strike = round(strike, 4)
    rounded_expiry = round(expiry_years, 6)
    return _live_cache.get_or_load(
        ("option_quote", symbol, kind, rounded_strike, rounded_expiry),
        OPTION_QUOTE_TTL_SECONDS,
        lambda: _fetch_nearest_option_quote_uncached(symbol, kind, strike, expiry_years),
    )


def fetch_option_chain_quotes(
    ticker: str,
    kind: str,
    spot: float,
    query_expiry: float,
    max_expirations: int,
    strike_window: float,
) -> list[dict[str, Any]]:
    """Fetch option-chain quotes across expirations near the current spot."""
    symbol = ticker.upper()
    return _live_cache.get_or_load(
        (
            "option_chain",
            symbol,
            kind,
            round(spot, 2),
            round(query_expiry, 6),
            max_expirations,
            round(strike_window, 4),
        ),
        OPTION_CHAIN_TTL_SECONDS,
        lambda: _fetch_option_chain_quotes_uncached(
            symbol,
            kind,
            spot,
            query_expiry,
            max_expirations,
            strike_window,
        ),
    )


def fetch_option_chain_ladder(
    ticker: str,
    spot: float,
    query_expiry: float,
    strike_window: float,
) -> dict[str, Any]:
    """Fetch calls and puts for the nearest expiry as a two-sided ladder."""
    symbol = ticker.upper()
    return _live_cache.get_or_load(
        ("option_ladder", symbol, round(spot, 2), round(query_expiry, 6), round(strike_window, 4)),
        OPTION_CHAIN_TTL_SECONDS,
        lambda: _fetch_option_chain_ladder_uncached(symbol, spot, query_expiry, strike_window),
    )


def _fetch_market_snapshot_uncached(symbol: str) -> dict[str, Any]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ValueError("Live market data requires installing the yfinance dependency.") from exc

    _wait_for_yahoo_slot()
    instrument = yf.Ticker(symbol)
    _wait_for_yahoo_slot()
    fast_info = instrument.fast_info

    price = _first_number(
        fast_info,
        ["last_price", "lastPrice", "regular_market_price"],
        {},
        ["regularMarketPrice", "currentPrice"],
    )
    previous_close = _first_number(
        fast_info,
        ["previous_close", "previousClose", "regular_market_previous_close"],
        {},
        ["regularMarketPreviousClose", "previousClose"],
    )
    info: dict[str, Any] = {}
    if price is None or previous_close is None:
        _wait_for_yahoo_slot()
        info = getattr(instrument, "info", {}) or {}
        price = price if price is not None else _first_number({}, [], info, ["regularMarketPrice", "currentPrice"])
        previous_close = previous_close if previous_close is not None else _first_number(
            {},
            [],
            info,
            ["regularMarketPreviousClose", "previousClose"],
        )
    if price is None or price <= 0.0:
        raise ValueError(f"No live price was available for ticker {symbol}.")

    change = None if previous_close is None else price - previous_close
    change_percent = None if previous_close in (None, 0.0) else change / previous_close
    _wait_for_yahoo_slot()
    expirations = list(getattr(instrument, "options", []) or [])

    return {
        "ticker": symbol,
        "price": price,
        "previous_close": previous_close,
        "change": change,
        "change_percent": change_percent,
        "currency": str(info.get("currency") or "USD"),
        "source": "Yahoo Finance",
        "timestamp": datetime.now(UTC).isoformat(),
        "option_expirations": expirations[:8],
    }


def _fetch_nearest_option_quote_uncached(symbol: str, kind: str, strike: float, expiry_years: float) -> dict[str, Any]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ValueError("Live option quotes require installing the yfinance dependency.") from exc

    _wait_for_yahoo_slot()
    instrument = yf.Ticker(symbol)
    _wait_for_yahoo_slot()
    expirations = list(getattr(instrument, "options", []) or [])
    if not expirations:
        raise ValueError(f"No option expirations were available for ticker {symbol}.")

    target_date = date.today() + timedelta(days=max(0, round(expiry_years * 365.0)))
    expiration = min(expirations, key=lambda value: abs(date.fromisoformat(value) - target_date))
    _wait_for_yahoo_slot()
    chain = instrument.option_chain(expiration)
    quotes = chain.calls if kind == "call" else chain.puts
    if quotes.empty:
        raise ValueError(f"No {kind} quotes were available for ticker {symbol} at {expiration}.")

    row_index = (quotes["strike"] - strike).abs().idxmin()
    row = quotes.loc[row_index]
    bid = _optional_float(row.get("bid"))
    ask = _optional_float(row.get("ask"))
    last_price = _optional_float(row.get("lastPrice"))
    mid = (bid + ask) / 2.0 if bid is not None and ask is not None and bid > 0.0 and ask > 0.0 else last_price

    return {
        "ticker": symbol,
        "kind": kind,
        "requested_strike": strike,
        "matched_strike": float(row["strike"]),
        "expiration": expiration,
        "last_price": last_price,
        "bid": bid,
        "ask": ask,
        "mid": mid,
        "implied_volatility": _optional_float(row.get("impliedVolatility")),
        "volume": _optional_int(row.get("volume")),
        "open_interest": _optional_int(row.get("openInterest")),
        "source": "Yahoo Finance",
    }


def _fetch_option_chain_quotes_uncached(
    symbol: str,
    kind: str,
    spot: float,
    query_expiry: float,
    max_expirations: int,
    strike_window: float,
) -> list[dict[str, Any]]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ValueError("Live option chains require installing the yfinance dependency.") from exc

    _wait_for_yahoo_slot()
    instrument = yf.Ticker(symbol)
    _wait_for_yahoo_slot()
    available_expirations = list(getattr(instrument, "options", []) or [])
    if not available_expirations:
        raise ValueError(f"No option expirations were available for ticker {symbol}.")
    target_date = date.today() + timedelta(days=max(1, round(query_expiry * 365.0)))
    expirations = sorted(
        available_expirations,
        key=lambda expiration: abs(date.fromisoformat(expiration) - target_date),
    )[:max_expirations]

    lower_strike = spot * max(0.0, 1.0 - strike_window)
    upper_strike = spot * (1.0 + strike_window)
    rows: list[dict[str, Any]] = []
    for expiration in expirations:
        _wait_for_yahoo_slot()
        chain = instrument.option_chain(expiration)
        quotes = chain.calls if kind == "call" else chain.puts
        if quotes.empty:
            continue
        window = quotes[(quotes["strike"] >= lower_strike) & (quotes["strike"] <= upper_strike)]
        if window.empty:
            window = quotes.loc[[(quotes["strike"] - spot).abs().idxmin()]]
        expiry_years = max(1.0 / 365.0, (date.fromisoformat(expiration) - date.today()).days / 365.0)
        for _, row in window.iterrows():
            rows.append(_option_chain_row(expiration, expiry_years, row))
    if not rows:
        raise ValueError(f"No usable {kind} option quotes were available for ticker {symbol}.")
    return rows


def _fetch_option_chain_ladder_uncached(
    symbol: str,
    spot: float,
    query_expiry: float,
    strike_window: float,
) -> dict[str, Any]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ValueError("Live option chains require installing the yfinance dependency.") from exc

    _wait_for_yahoo_slot()
    instrument = yf.Ticker(symbol)
    _wait_for_yahoo_slot()
    available_expirations = list(getattr(instrument, "options", []) or [])
    if not available_expirations:
        raise ValueError(f"No option expirations were available for ticker {symbol}.")

    target_date = date.today() + timedelta(days=max(1, round(query_expiry * 365.0)))
    expiration = min(available_expirations, key=lambda value: abs(date.fromisoformat(value) - target_date))
    expiry_years = max(1.0 / 365.0, (date.fromisoformat(expiration) - date.today()).days / 365.0)
    lower_strike = spot * max(0.0, 1.0 - strike_window)
    upper_strike = spot * (1.0 + strike_window)

    _wait_for_yahoo_slot()
    chain = instrument.option_chain(expiration)
    calls = _window_quotes(chain.calls, spot, lower_strike, upper_strike)
    puts = _window_quotes(chain.puts, spot, lower_strike, upper_strike)
    call_map = {float(row["strike"]): _option_chain_side(row) for _, row in calls.iterrows()}
    put_map = {float(row["strike"]): _option_chain_side(row) for _, row in puts.iterrows()}
    strikes = sorted(set(call_map) | set(put_map))
    if not strikes:
        raise ValueError(f"No usable option quotes were available for ticker {symbol}.")

    return {
        "expiration": expiration,
        "expiry_years": expiry_years,
        "rows": [
            {"strike": strike, "call": call_map.get(strike), "put": put_map.get(strike)}
            for strike in strikes
        ],
    }


def _wait_for_yahoo_slot() -> None:
    global _last_yahoo_request
    if YAHOO_MIN_REQUEST_INTERVAL_SECONDS <= 0.0:
        return
    with _yahoo_lock:
        now = time.monotonic()
        wait_seconds = _last_yahoo_request + YAHOO_MIN_REQUEST_INTERVAL_SECONDS - now
        if wait_seconds > 0.0:
            time.sleep(wait_seconds)
            now = time.monotonic()
        _last_yahoo_request = now


def _first_number(primary: Any, primary_keys: list[str], fallback: dict[str, Any], fallback_keys: list[str]) -> float | None:
    for key in primary_keys:
        value = _get_value(primary, key)
        if isinstance(value, int | float):
            return float(value)
    for key in fallback_keys:
        value = fallback.get(key)
        if isinstance(value, int | float):
            return float(value)
    return None


def _get_value(source: Any, key: str) -> Any:
    try:
        if isinstance(source, dict):
            return source.get(key)
        return getattr(source, key)
    except (AttributeError, KeyError, TypeError):
        return None


def _optional_float(value: Any) -> float | None:
    if isinstance(value, int | float) and value == value:
        return float(value)
    return None


def _optional_int(value: Any) -> int | None:
    if isinstance(value, int | float) and value == value:
        return int(value)
    return None


def _option_chain_row(expiration: str, expiry_years: float, row: Any) -> dict[str, Any]:
    side = _option_chain_side(row)
    return {
        "expiration": expiration,
        "expiry_years": expiry_years,
        "strike": float(row["strike"]),
        **side,
    }


def _option_chain_side(row: Any) -> dict[str, Any]:
    bid = _optional_float(row.get("bid"))
    ask = _optional_float(row.get("ask"))
    last_price = _optional_float(row.get("lastPrice"))
    mid = (bid + ask) / 2.0 if bid is not None and ask is not None and bid > 0.0 and ask > 0.0 else last_price
    return {
        "bid": bid,
        "ask": ask,
        "last_price": last_price,
        "mid": mid,
        "implied_volatility": _optional_float(row.get("impliedVolatility")),
        "volume": _optional_int(row.get("volume")),
        "open_interest": _optional_int(row.get("openInterest")),
    }


def _window_quotes(quotes: Any, spot: float, lower_strike: float, upper_strike: float) -> Any:
    if quotes.empty:
        return quotes
    window = quotes[(quotes["strike"] >= lower_strike) & (quotes["strike"] <= upper_strike)]
    if not window.empty:
        return window
    return quotes.loc[[(quotes["strike"] - spot).abs().idxmin()]]
