"""High-level analytics API."""

from options_lab.analytics.hedging import simulate_delta_hedge
from options_lab.analytics.portfolio import portfolio_greeks, portfolio_value, standard_stress_tests
from options_lab.analytics.pricing import (
    binomial_tree_price,
    black_scholes_greeks,
    black_scholes_price,
    cpp_core_status,
    implied_volatility,
    local_vol_monte_carlo_price,
    local_volatility,
    monte_carlo_price,
    no_arbitrage_bounds,
    stochastic_vol_monte_carlo_price,
)
from options_lab.analytics.surface import VolSurface, synthetic_option_chain
from options_lab.analytics.types import (
    Greeks,
    HedgingConfig,
    HedgingResult,
    HestonParams,
    LocalVolModel,
    MarketData,
    OptionContract,
    PathConfig,
    Portfolio,
    Position,
    Scenario,
    VolQuote,
)
from options_lab.analytics.portfolio import scenario_greeks
from options_lab.calibration import load_option_chain_csv

__all__ = [
    "Greeks",
    "HedgingConfig",
    "HedgingResult",
    "HestonParams",
    "LocalVolModel",
    "MarketData",
    "OptionContract",
    "PathConfig",
    "Portfolio",
    "Position",
    "Scenario",
    "VolQuote",
    "VolSurface",
    "binomial_tree_price",
    "black_scholes_greeks",
    "black_scholes_price",
    "cpp_core_status",
    "implied_volatility",
    "load_option_chain_csv",
    "local_vol_monte_carlo_price",
    "local_volatility",
    "monte_carlo_price",
    "no_arbitrage_bounds",
    "portfolio_greeks",
    "portfolio_value",
    "scenario_greeks",
    "simulate_delta_hedge",
    "standard_stress_tests",
    "stochastic_vol_monte_carlo_price",
    "synthetic_option_chain",
]
