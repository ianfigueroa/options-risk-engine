"""Pricing, Greeks, and implied-volatility analytics."""

from __future__ import annotations

import math
import random

from options_lab.analytics.types import (
    Greeks,
    HestonParams,
    LocalVolModel,
    MarketData,
    OptionContract,
    PathConfig,
)
from options_lab.bindings import CORE_AVAILABLE, core


def cpp_core_status() -> dict[str, bool | str]:
    return {"available": CORE_AVAILABLE, "backend": "cpp" if CORE_AVAILABLE else "python"}


def _cpp_option(contract: OptionContract):
    option = core.OptionContract()
    option.type = core.OptionType.call if contract.kind == "call" else core.OptionType.put
    option.exercise = (
        core.ExerciseType.american if contract.exercise == "american" else core.ExerciseType.european
    )
    option.strike = contract.strike
    option.time_to_expiry = contract.time_to_expiry
    return option


def _cpp_market(market: MarketData):
    data = core.MarketData()
    data.spot = market.spot
    data.rate = market.rate
    data.dividend_yield = market.dividend_yield
    data.volatility = market.volatility
    return data


def _from_cpp_greeks(values) -> Greeks:
    return Greeks(
        delta=values.delta,
        gamma=values.gamma,
        vega=values.vega,
        theta=values.theta,
        rho=values.rho,
    )


def _cpp_path_config(config: PathConfig):
    values = core.PathConfig()
    values.paths = config.paths
    values.steps = config.steps
    values.seed = config.seed
    values.antithetic = config.antithetic
    return values


def _normal_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def _normal_cdf(x: float) -> float:
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


def _intrinsic(contract: OptionContract, spot: float) -> float:
    if contract.kind == "call":
        return max(spot - contract.strike, 0.0)
    return max(contract.strike - spot, 0.0)


def _d_values(contract: OptionContract, market: MarketData) -> tuple[float, float]:
    sqrt_t = math.sqrt(contract.time_to_expiry)
    variance = market.volatility * market.volatility
    d1 = (
        math.log(market.spot / contract.strike)
        + (market.rate - market.dividend_yield + 0.5 * variance) * contract.time_to_expiry
    ) / (market.volatility * sqrt_t)
    return d1, d1 - market.volatility * sqrt_t


def black_scholes_price(contract: OptionContract, market: MarketData) -> float:
    if CORE_AVAILABLE:
        return float(core.black_scholes_price(_cpp_option(contract), _cpp_market(market)))
    if contract.time_to_expiry == 0.0:
        return _intrinsic(contract, market.spot)

    spot_discount = market.spot * math.exp(-market.dividend_yield * contract.time_to_expiry)
    strike_discount = contract.strike * math.exp(-market.rate * contract.time_to_expiry)
    if market.volatility == 0.0:
        if contract.kind == "call":
            return max(spot_discount - strike_discount, 0.0)
        return max(strike_discount - spot_discount, 0.0)

    d1, d2 = _d_values(contract, market)
    if contract.kind == "call":
        return spot_discount * _normal_cdf(d1) - strike_discount * _normal_cdf(d2)
    return strike_discount * _normal_cdf(-d2) - spot_discount * _normal_cdf(-d1)


def black_scholes_greeks(contract: OptionContract, market: MarketData) -> Greeks:
    if CORE_AVAILABLE:
        return _from_cpp_greeks(core.black_scholes_greeks(_cpp_option(contract), _cpp_market(market)))
    if contract.time_to_expiry == 0.0 or market.volatility == 0.0:
        return Greeks()

    d1, d2 = _d_values(contract, market)
    sqrt_t = math.sqrt(contract.time_to_expiry)
    spot_discount = math.exp(-market.dividend_yield * contract.time_to_expiry)
    strike_discount = math.exp(-market.rate * contract.time_to_expiry)
    gamma = spot_discount * _normal_pdf(d1) / (market.spot * market.volatility * sqrt_t)
    vega = market.spot * spot_discount * _normal_pdf(d1) * sqrt_t

    if contract.kind == "call":
        return Greeks(
            delta=spot_discount * _normal_cdf(d1),
            gamma=gamma,
            vega=vega,
            theta=-market.spot * spot_discount * _normal_pdf(d1) * market.volatility / (2.0 * sqrt_t)
            - market.rate * contract.strike * strike_discount * _normal_cdf(d2)
            + market.dividend_yield * market.spot * spot_discount * _normal_cdf(d1),
            rho=contract.strike * contract.time_to_expiry * strike_discount * _normal_cdf(d2),
        )

    return Greeks(
        delta=spot_discount * (_normal_cdf(d1) - 1.0),
        gamma=gamma,
        vega=vega,
        theta=-market.spot * spot_discount * _normal_pdf(d1) * market.volatility / (2.0 * sqrt_t)
        + market.rate * contract.strike * strike_discount * _normal_cdf(-d2)
        - market.dividend_yield * market.spot * spot_discount * _normal_cdf(-d1),
        rho=-contract.strike * contract.time_to_expiry * strike_discount * _normal_cdf(-d2),
    )


def no_arbitrage_bounds(contract: OptionContract, market: MarketData) -> tuple[float, float]:
    spot_discount = market.spot * math.exp(-market.dividend_yield * contract.time_to_expiry)
    strike_discount = contract.strike * math.exp(-market.rate * contract.time_to_expiry)
    if contract.kind == "call":
        return max(spot_discount - strike_discount, 0.0), spot_discount
    return max(strike_discount - spot_discount, 0.0), strike_discount


def implied_volatility(
    contract: OptionContract,
    market: MarketData,
    option_price: float,
    initial_guess: float = 0.2,
    tolerance: float = 1e-10,
    max_iterations: int = 100,
) -> float:
    if CORE_AVAILABLE:
        return float(
            core.implied_volatility(
                _cpp_option(contract),
                _cpp_market(market),
                option_price,
                initial_guess,
                tolerance,
                max_iterations,
            )
        )
    lower, upper = no_arbitrage_bounds(contract, market)
    if not math.isfinite(option_price) or option_price < lower - 1e-10 or option_price > upper + 1e-10:
        raise ValueError("option price violates European no-arbitrage bounds")
    if contract.time_to_expiry == 0.0:
        raise ValueError("implied volatility is undefined at expiry")

    low, high = 1e-8, 5.0
    sigma = min(max(initial_guess, low), high)

    def price_at(volatility: float) -> float:
        return black_scholes_price(
            contract,
            MarketData(market.spot, market.rate, market.dividend_yield, volatility),
        )

    for _ in range(max_iterations):
        error = price_at(sigma) - option_price
        if abs(error) < tolerance:
            return sigma
        if error > 0.0:
            high = sigma
        else:
            low = sigma
        vega = black_scholes_greeks(
            contract,
            MarketData(market.spot, market.rate, market.dividend_yield, sigma),
        ).vega
        newton = sigma - error / vega if vega > 1e-16 else math.nan
        sigma = 0.5 * (low + high) if not math.isfinite(newton) or not low < newton < high else newton

    raise ValueError("implied volatility solver did not converge")


def binomial_tree_price(contract: OptionContract, market: MarketData, steps: int = 300) -> float:
    if CORE_AVAILABLE:
        return float(core.binomial_tree_price(_cpp_option(contract), _cpp_market(market), steps))
    if steps <= 0:
        raise ValueError("steps must be positive")
    if contract.time_to_expiry == 0.0 or market.volatility == 0.0:
        return black_scholes_price(contract, market)
    dt = contract.time_to_expiry / steps
    up = math.exp(market.volatility * math.sqrt(dt))
    down = 1.0 / up
    probability = (math.exp((market.rate - market.dividend_yield) * dt) - down) / (up - down)
    if not 0.0 <= probability <= 1.0:
        raise ValueError("invalid risk-neutral probability")
    discount = math.exp(-market.rate * dt)
    values = [
        _intrinsic(contract, market.spot * up ** (steps - node) * down**node)
        for node in range(steps + 1)
    ]
    for step in range(steps, 0, -1):
        for node in range(step):
            continuation = discount * (probability * values[node] + (1.0 - probability) * values[node + 1])
            if contract.exercise == "american":
                spot = market.spot * up ** (step - 1 - node) * down**node
                values[node] = max(continuation, _intrinsic(contract, spot))
            else:
                values[node] = continuation
    return values[0]


def monte_carlo_price(
    contract: OptionContract,
    market: MarketData,
    paths: int = 10000,
    seed: int = 42,
    antithetic: bool = True,
) -> float:
    if CORE_AVAILABLE:
        config = core.MonteCarloConfig()
        config.paths = paths
        config.seed = seed
        config.antithetic = antithetic
        return float(core.monte_carlo_price(_cpp_option(contract), _cpp_market(market), config))
    if paths <= 0:
        raise ValueError("paths must be positive")
    rng = random.Random(seed)
    total = 0.0
    samples = 0

    def terminal(z: float) -> float:
        drift = (
            market.rate
            - market.dividend_yield
            - 0.5 * market.volatility * market.volatility
        ) * contract.time_to_expiry
        diffusion = market.volatility * math.sqrt(contract.time_to_expiry) * z
        return market.spot * math.exp(drift + diffusion)

    for _ in range(paths):
        z = rng.gauss(0.0, 1.0)
        total += _intrinsic(contract, terminal(z))
        samples += 1
        if antithetic:
            total += _intrinsic(contract, terminal(-z))
            samples += 1

    return math.exp(-market.rate * contract.time_to_expiry) * total / samples


def local_volatility(model: LocalVolModel, spot: float, reference_spot: float, elapsed_time: float) -> float:
    if CORE_AVAILABLE:
        cpp_model = core.LocalVolModel()
        cpp_model.base_volatility = model.base_volatility
        cpp_model.spot_slope = model.spot_slope
        cpp_model.time_slope = model.time_slope
        cpp_model.min_volatility = model.min_volatility
        cpp_model.max_volatility = model.max_volatility
        return float(core.local_volatility(cpp_model, spot, reference_spot, elapsed_time))
    if model.base_volatility <= 0.0 or model.min_volatility <= 0.0:
        raise ValueError("local volatility levels must be positive")
    if model.max_volatility < model.min_volatility:
        raise ValueError("local volatility cap must exceed floor")
    raw = model.base_volatility + model.spot_slope * (spot / reference_spot - 1.0) + model.time_slope * elapsed_time
    return min(max(raw, model.min_volatility), model.max_volatility)


def local_vol_monte_carlo_price(
    contract: OptionContract,
    market: MarketData,
    model: LocalVolModel,
    config: PathConfig | None = None,
) -> float:
    config = config or PathConfig()
    if CORE_AVAILABLE:
        cpp_model = core.LocalVolModel()
        cpp_model.base_volatility = model.base_volatility
        cpp_model.spot_slope = model.spot_slope
        cpp_model.time_slope = model.time_slope
        cpp_model.min_volatility = model.min_volatility
        cpp_model.max_volatility = model.max_volatility
        return float(core.local_vol_monte_carlo_price(_cpp_option(contract), _cpp_market(market), cpp_model, _cpp_path_config(config)))
    if config.paths <= 0 or config.steps <= 0:
        raise ValueError("path count and steps must be positive")
    rng = random.Random(config.seed)
    dt = contract.time_to_expiry / config.steps
    payoff_sum = 0.0
    samples = 0
    for _ in range(config.paths):
        spot = market.spot
        anti_spot = market.spot
        for step in range(config.steps):
            elapsed = step * dt
            z = rng.gauss(0.0, 1.0)
            vol = local_volatility(model, spot, market.spot, elapsed)
            spot *= math.exp((market.rate - market.dividend_yield - 0.5 * vol * vol) * dt + vol * math.sqrt(dt) * z)
            if config.antithetic:
                anti_vol = local_volatility(model, anti_spot, market.spot, elapsed)
                anti_spot *= math.exp((market.rate - market.dividend_yield - 0.5 * anti_vol * anti_vol) * dt - anti_vol * math.sqrt(dt) * z)
        payoff_sum += _intrinsic(contract, spot)
        samples += 1
        if config.antithetic:
            payoff_sum += _intrinsic(contract, anti_spot)
            samples += 1
    return math.exp(-market.rate * contract.time_to_expiry) * payoff_sum / samples


def stochastic_vol_monte_carlo_price(
    contract: OptionContract,
    market: MarketData,
    params: HestonParams,
    config: PathConfig | None = None,
) -> float:
    config = config or PathConfig()
    if CORE_AVAILABLE:
        cpp_params = core.HestonParams()
        cpp_params.initial_variance = params.initial_variance
        cpp_params.long_run_variance = params.long_run_variance
        cpp_params.mean_reversion = params.mean_reversion
        cpp_params.vol_of_vol = params.vol_of_vol
        cpp_params.correlation = params.correlation
        return float(core.stochastic_vol_monte_carlo_price(_cpp_option(contract), _cpp_market(market), cpp_params, _cpp_path_config(config)))
    if not -1.0 <= params.correlation <= 1.0:
        raise ValueError("heston correlation must be within [-1, 1]")
    if config.paths <= 0 or config.steps <= 0:
        raise ValueError("path count and steps must be positive")
    rng = random.Random(config.seed)
    dt = contract.time_to_expiry / config.steps
    independent = math.sqrt(1.0 - params.correlation * params.correlation)
    payoff_sum = 0.0
    samples = 0
    for _ in range(config.paths):
        spot = market.spot
        variance = params.initial_variance
        for _step in range(config.steps):
            z1 = rng.gauss(0.0, 1.0)
            z2 = rng.gauss(0.0, 1.0)
            zv = params.correlation * z1 + independent * z2
            variance_floor = max(variance, 0.0)
            sigma = math.sqrt(variance_floor)
            spot *= math.exp((market.rate - market.dividend_yield - 0.5 * variance_floor) * dt + sigma * math.sqrt(dt) * z1)
            variance = max(0.0, variance + params.mean_reversion * (params.long_run_variance - variance_floor) * dt + params.vol_of_vol * sigma * math.sqrt(dt) * zv)
        payoff_sum += _intrinsic(contract, spot)
        samples += 1
    return math.exp(-market.rate * contract.time_to_expiry) * payoff_sum / samples
