"""Run delta-hedging experiments for the research report."""

from __future__ import annotations

from dataclasses import replace

from options_lab import analytics as ol


def run_hedging_experiments() -> list[dict[str, float | str]]:
    contract = ol.OptionContract(kind="call", strike=100.0, time_to_expiry=1.0)
    market = ol.MarketData(spot=100.0, rate=0.02, dividend_yield=0.0, volatility=0.20)
    base = ol.HedgingConfig(steps=252, rebalance_interval=1, seed=11)
    experiments = [
        ("correct volatility", base),
        ("underestimated volatility", replace(base, assumed_volatility=0.14)),
        ("overestimated volatility", replace(base, assumed_volatility=0.28)),
        ("weekly rebalancing", replace(base, rebalance_interval=5)),
        ("high transaction costs", replace(base, transaction_cost_rate=0.005)),
        ("jump diffusion", replace(base, jump_intensity=4.0, jump_stddev=0.08)),
    ]

    rows: list[dict[str, float | str]] = []
    for label, config in experiments:
        result = ol.simulate_delta_hedge(contract, market, config)
        rows.append(
            {
                "experiment": label,
                "hedging_error": result.hedging_error,
                "absolute_error": abs(result.hedging_error),
                "transaction_costs": result.transaction_costs,
                "terminal_spot": result.terminal_spot,
            }
        )
    return rows


if __name__ == "__main__":
    for row in run_hedging_experiments():
        print(row)

