"""Market data adapters for public quote lookups."""

from __future__ import annotations

from datetime import UTC, datetime
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
