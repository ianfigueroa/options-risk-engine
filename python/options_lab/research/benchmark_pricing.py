"""Microbenchmarks for Python pricing functions."""

from __future__ import annotations

import time

from options_lab import analytics as ol


def benchmark_python_pricing(count: int) -> tuple[float, float]:
    market = ol.MarketData(spot=100.0, rate=0.04, dividend_yield=0.01, volatility=0.22)
    checksum = 0.0
    start = time.perf_counter()
    for index in range(count):
        contract = ol.OptionContract(
            kind="call" if index % 2 == 0 else "put",
            strike=75.0 + index % 80,
            time_to_expiry=0.05 + (index % 24) / 12.0,
        )
        checksum += ol.black_scholes_price(contract, market)
    return (time.perf_counter() - start) * 1000.0, checksum


def benchmark_monte_carlo(paths: int) -> float:
    market = ol.MarketData(spot=100.0, rate=0.05, dividend_yield=0.0, volatility=0.20)
    contract = ol.OptionContract(kind="call", strike=100.0, time_to_expiry=1.0)
    start = time.perf_counter()
    ol.monte_carlo_price(contract, market, paths=paths, seed=7)
    return (time.perf_counter() - start) * 1000.0


if __name__ == "__main__":
    for count in (1_000, 100_000):
        elapsed, checksum = benchmark_python_pricing(count)
        print(f"python_black_scholes count={count} elapsed_ms={elapsed:.3f} checksum={checksum:.6f}")
    for paths in (10_000, 100_000):
        elapsed = benchmark_monte_carlo(paths)
        print(f"python_monte_carlo paths={paths} elapsed_ms={elapsed:.3f}")

