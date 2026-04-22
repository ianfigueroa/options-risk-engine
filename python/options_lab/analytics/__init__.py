"""High-level analytics API."""

from options_lab.analytics.hedging import simulate_delta_hedge
from options_lab.analytics.portfolio import portfolio_greeks, portfolio_value, standard_stress_tests
from options_lab.analytics.pricing import (
    binomial_tree_price,
    black_scholes_greeks,
    black_scholes_price,
    implied_volatility,
    monte_carlo_price,
    no_arbitrage_bounds,
)
from options_lab.analytics.surface import VolSurface, synthetic_option_chain
from options_lab.analytics.types import (
    Greeks,
    HedgingConfig,
    HedgingResult,
    MarketData,
    OptionContract,
    Portfolio,
    Position,
    VolQuote,
)

__all__ = [
    "Greeks",
    "HedgingConfig",
    "HedgingResult",
    "MarketData",
    "OptionContract",
    "Portfolio",
    "Position",
    "VolQuote",
    "VolSurface",
    "binomial_tree_price",
    "black_scholes_greeks",
    "black_scholes_price",
    "implied_volatility",
    "monte_carlo_price",
    "no_arbitrage_bounds",
    "portfolio_greeks",
    "portfolio_value",
    "simulate_delta_hedge",
    "standard_stress_tests",
    "synthetic_option_chain",
]

