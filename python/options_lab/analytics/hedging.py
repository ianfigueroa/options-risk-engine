"""Delta hedging simulation utilities."""

from __future__ import annotations

import math
import random
from dataclasses import replace

from options_lab.analytics.pricing import black_scholes_greeks, black_scholes_price
from options_lab.analytics.types import HedgingConfig, HedgingResult, MarketData, OptionContract


def _intrinsic(contract: OptionContract, spot: float) -> float:
    if contract.kind == "call":
        return max(spot - contract.strike, 0.0)
    return max(contract.strike - spot, 0.0)


def _validate_config(config: HedgingConfig) -> None:
    if config.steps <= 0 or config.rebalance_interval <= 0:
        raise ValueError("steps and rebalance_interval must be positive")
    if config.rebalance_interval > config.steps:
        raise ValueError("rebalance_interval cannot exceed steps")
    if config.assumed_volatility <= 0.0 or config.realized_volatility < 0.0:
        raise ValueError("hedging volatilities are invalid")
    if config.transaction_cost_rate < 0.0:
        raise ValueError("transaction_cost_rate cannot be negative")
    if config.jump_intensity < 0.0 or config.jump_stddev < 0.0:
        raise ValueError("jump parameters cannot be negative")


def _delta(
    contract: OptionContract,
    market: MarketData,
    spot: float,
    remaining_time: float,
    assumed_volatility: float,
) -> float:
    if remaining_time <= 0.0:
        return 0.0
    priced_contract = replace(contract, time_to_expiry=remaining_time)
    priced_market = MarketData(
        spot=spot,
        rate=market.rate,
        dividend_yield=market.dividend_yield,
        volatility=assumed_volatility,
    )
    return black_scholes_greeks(priced_contract, priced_market).delta


def simulate_delta_hedge(
    contract: OptionContract,
    market: MarketData,
    config: HedgingConfig | None = None,
) -> HedgingResult:
    config = config or HedgingConfig()
    _validate_config(config)

    pricing_market = MarketData(
        spot=market.spot,
        rate=market.rate,
        dividend_yield=market.dividend_yield,
        volatility=config.assumed_volatility,
    )
    premium = black_scholes_price(contract, pricing_market)
    dt = contract.time_to_expiry / config.steps
    rng = random.Random(config.seed)

    spot = market.spot
    delta = _delta(contract, market, spot, contract.time_to_expiry, config.assumed_volatility)
    transaction_costs = abs(delta) * spot * config.transaction_cost_rate
    cash = premium - delta * spot - transaction_costs
    spot_path = [spot]
    delta_path = [delta]

    for step in range(1, config.steps + 1):
        cash *= math.exp(market.rate * dt)
        z = rng.gauss(0.0, 1.0)
        drift = (
            market.rate
            - market.dividend_yield
            - 0.5 * config.realized_volatility * config.realized_volatility
        ) * dt
        diffusion = config.realized_volatility * math.sqrt(dt) * z
        spot *= math.exp(drift + diffusion)

        if config.jump_intensity > 0.0 and rng.random() < min(1.0, config.jump_intensity * dt):
            jump_z = rng.gauss(0.0, 1.0)
            spot *= math.exp(
                config.jump_mean
                - 0.5 * config.jump_stddev * config.jump_stddev
                + config.jump_stddev * jump_z
            )

        remaining_time = max(0.0, contract.time_to_expiry - step * dt)
        if remaining_time > 0.0 and step % config.rebalance_interval == 0:
            next_delta = _delta(contract, market, spot, remaining_time, config.assumed_volatility)
            trade = next_delta - delta
            cost = abs(trade) * spot * config.transaction_cost_rate
            cash -= trade * spot + cost
            transaction_costs += cost
            delta = next_delta

        spot_path.append(spot)
        delta_path.append(delta)

    payoff = _intrinsic(contract, spot)
    hedging_error = cash + delta * spot - payoff
    return HedgingResult(
        option_premium=premium,
        terminal_spot=spot,
        hedging_error=hedging_error,
        transaction_costs=transaction_costs,
        spot_path=spot_path,
        delta_path=delta_path,
    )

