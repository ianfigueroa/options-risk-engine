"""Option-chain CSV loading utilities."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from options_lab.analytics.types import VolQuote

REQUIRED_COLUMNS = {"strike", "expiry", "implied_vol"}


def load_option_chain_csv(path: str | Path) -> list[VolQuote]:
    source = Path(path)
    with source.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - columns
        if missing:
            raise ValueError(f"missing option-chain columns: {', '.join(sorted(missing))}")
        return [_row_to_quote(row, index + 2) for index, row in enumerate(reader)]


def _row_to_quote(row: dict[str, Any], line_number: int) -> VolQuote:
    try:
        strike = float(row["strike"])
        expiry = float(row["expiry"])
        implied_vol = float(row["implied_vol"])
        bid = float(row.get("bid") or 0.0)
        ask = float(row.get("ask") or 0.0)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid numeric option-chain value on line {line_number}") from exc
    return VolQuote(strike=strike, expiry=expiry, implied_vol=implied_vol, bid=bid, ask=ask)
