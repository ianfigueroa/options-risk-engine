"""Market data adapters for public quote lookups."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any


def fetch_market_snapshot(ticker: str) -> dict[str, Any]:
    """Fetch a compact stock quote snapshot from Yahoo Finance via yfinance."""
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ValueError("Live market data requires installing the yfinance dependency.") from exc

    symbol = ticker.upper()
    instrument = yf.Ticker(symbol)
    fast_info = instrument.fast_info
    info = getattr(instrument, "info", {}) or {}

    price = _first_number(
        fast_info,
        ["last_price", "lastPrice", "regular_market_price"],
        info,
        ["regularMarketPrice", "currentPrice"],
    )
    previous_close = _first_number(
        fast_info,
        ["previous_close", "previousClose", "regular_market_previous_close"],
        info,
        ["regularMarketPreviousClose", "previousClose"],
    )
    if price is None or price <= 0.0:
        raise ValueError(f"No live price was available for ticker {symbol}.")

    change = None if previous_close is None else price - previous_close
    change_percent = None if previous_close in (None, 0.0) else change / previous_close
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


def fetch_nearest_option_quote(ticker: str, kind: str, strike: float, expiry_years: float) -> dict[str, Any]:
    """Fetch the closest listed option quote for a target strike and expiry."""
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ValueError("Live option quotes require installing the yfinance dependency.") from exc

    symbol = ticker.upper()
    instrument = yf.Ticker(symbol)
    expirations = list(getattr(instrument, "options", []) or [])
    if not expirations:
        raise ValueError(f"No option expirations were available for ticker {symbol}.")

    target_date = date.today() + timedelta(days=max(0, round(expiry_years * 365.0)))
    expiration = min(expirations, key=lambda value: abs(date.fromisoformat(value) - target_date))
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
