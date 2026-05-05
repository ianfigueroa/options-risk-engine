"""Volatility surface construction and quote diagnostics."""

from __future__ import annotations

from collections import defaultdict

from options_lab.analytics.types import VolQuote


class VolSurface:
    def __init__(self, quotes: list[VolQuote]) -> None:
        if not quotes:
            raise ValueError("vol surface requires at least one quote")
        for quote in quotes:
            if quote.strike <= 0.0 or quote.expiry <= 0.0:
                raise ValueError("quote strike and expiry must be positive")
        self.quotes = quotes
        self.strikes = sorted({quote.strike for quote in quotes})
        self.expiries = sorted({quote.expiry for quote in quotes})
        self._grid = {(quote.strike, quote.expiry): quote.implied_vol for quote in quotes}

    def _bracket(self, values: list[float], target: float) -> tuple[float, float]:
        if target < values[0] or target > values[-1]:
            raise ValueError("interpolation point is outside surface domain")
        lower = values[0]
        for value in values:
            if value >= target:
                return (value, value) if value == target else (lower, value)
            lower = value
        return values[-1], values[-1]

    def _vol(self, strike: float, expiry: float) -> float:
        try:
            return self._grid[(strike, expiry)]
        except KeyError as exc:
            raise ValueError("vol surface grid is missing an interpolation corner") from exc

    def interpolate(self, strike: float, expiry: float) -> float:
        low_strike, high_strike = self._bracket(self.strikes, strike)
        low_expiry, high_expiry = self._bracket(self.expiries, expiry)
        strike_weight = 0.0 if high_strike == low_strike else (strike - low_strike) / (high_strike - low_strike)
        expiry_weight = 0.0 if high_expiry == low_expiry else (expiry - low_expiry) / (high_expiry - low_expiry)
        v00 = self._vol(low_strike, low_expiry)
        v10 = self._vol(high_strike, low_expiry)
        v01 = self._vol(low_strike, high_expiry)
        v11 = self._vol(high_strike, high_expiry)
        low = v00 + strike_weight * (v10 - v00)
        high = v01 + strike_weight * (v11 - v01)
        return low + expiry_weight * (high - low)

    def detect_suspicious_quotes(self, max_absolute_spread: float = 0.5) -> list[dict[str, object]]:
        warnings: list[dict[str, object]] = []
        for index, quote in enumerate(self.quotes):
            if quote.implied_vol <= 0.0:
                warnings.append({"index": index, "reason": "non-positive implied volatility"})
            if quote.bid < 0.0 or quote.ask < 0.0 or quote.bid > quote.ask:
                warnings.append({"index": index, "reason": "invalid bid ask quote"})
            elif quote.ask - quote.bid > max_absolute_spread:
                warnings.append({"index": index, "reason": "wide bid ask spread"})
        return warnings

    def arbitrage_warnings(self) -> list[str]:
        warnings: list[str] = []
        warnings.extend(self._calendar_warnings())
        warnings.extend(self._butterfly_warnings())
        return warnings

    def _calendar_warnings(self) -> list[str]:
        by_strike: dict[float, list[VolQuote]] = defaultdict(list)
        for quote in self.quotes:
            by_strike[quote.strike].append(quote)
        warnings: list[str] = []
        for strike, quotes in by_strike.items():
            total_variance = -1.0
            for quote in sorted(quotes, key=lambda item: item.expiry):
                current = quote.implied_vol * quote.implied_vol * quote.expiry
                if current + 1e-12 < total_variance:
                    warnings.append(f"calendar total variance decreases for strike {strike}")
                total_variance = current
        return warnings

    def _butterfly_warnings(self) -> list[str]:
        """Flag slices where the smile is concave-down across three adjacent
        strikes — a coarse proxy for negative butterfly density.

        A clean implied-density slice should have implied vol that produces
        a non-negative second derivative of the call price w.r.t. strike.
        At the *vol* level, that translates to a smile that does not curve
        sharply downward in the middle relative to its wings.  This check is
        a diagnostic, not a calibrated arb test.
        """
        by_expiry: dict[float, list[VolQuote]] = defaultdict(list)
        for quote in self.quotes:
            by_expiry[quote.expiry].append(quote)
        warnings: list[str] = []
        for expiry, quotes in by_expiry.items():
            ordered = sorted(quotes, key=lambda item: item.strike)
            for left, mid, right in zip(ordered, ordered[1:], ordered[2:], strict=False):
                spacing_left = mid.strike - left.strike
                spacing_right = right.strike - mid.strike
                if spacing_left <= 0.0 or spacing_right <= 0.0:
                    continue
                # Linear interpolation of the wing IVs at the middle strike.
                weight = spacing_left / (spacing_left + spacing_right)
                interpolated = left.implied_vol + weight * (right.implied_vol - left.implied_vol)
                if mid.implied_vol + 1e-9 < interpolated - 0.05:
                    warnings.append(
                        f"butterfly concavity at strike {mid.strike} expiry {expiry}"
                    )
        return warnings


def synthetic_option_chain(
    spot: float,
    expiries: list[float],
    strikes: list[float],
    base_vol: float = 0.20,
) -> list[VolQuote]:
    quotes: list[VolQuote] = []
    for expiry in expiries:
        for strike in strikes:
            moneyness = strike / spot
            skew = 0.08 * max(moneyness - 1.0, 0.0) + 0.12 * max(1.0 - moneyness, 0.0)
            term = 0.03 * expiry
            vol = max(0.05, base_vol + skew + term)
            mid = max(0.10, spot * vol * 0.02)
            quotes.append(VolQuote(strike=strike, expiry=expiry, implied_vol=vol, bid=mid * 0.95, ask=mid * 1.05))
    return quotes

