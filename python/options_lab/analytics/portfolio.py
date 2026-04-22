"""Portfolio-level valuation, Greeks, and stress testing."""

from __future__ import annotations

from dataclasses import replace

from options_lab.analytics.pricing import black_scholes_greeks, black_scholes_price
from options_lab.analytics.types import Greeks, MarketData, Portfolio


def portfolio_value(portfolio: Portfolio, market: MarketData) -> float:
    value = portfolio.underlying_units * market.spot + portfolio.cash
    for position in portfolio.positions:
        value += position.quantity * black_scholes_price(position.contract, market)
    return value


def portfolio_greeks(portfolio: Portfolio, market: MarketData) -> Greeks:
    delta = portfolio.underlying_units
    gamma = vega = theta = rho = 0.0
    for position in portfolio.positions:
        greeks = black_scholes_greeks(position.contract, market)
        delta += position.quantity * greeks.delta
        gamma += position.quantity * greeks.gamma
        vega += position.quantity * greeks.vega
        theta += position.quantity * greeks.theta
        rho += position.quantity * greeks.rho
    return Greeks(delta=delta, gamma=gamma, vega=vega, theta=theta, rho=rho)


def _scenario_value(
    portfolio: Portfolio,
    market: MarketData,
    spot_shock: float = 0.0,
    vol_shock: float = 0.0,
    rate_shock: float = 0.0,
    time_decay: float = 0.0,
) -> float:
    shocked = MarketData(
        spot=market.spot * (1.0 + spot_shock),
        rate=market.rate + rate_shock,
        dividend_yield=market.dividend_yield,
        volatility=max(0.0, market.volatility + vol_shock),
    )
    value = portfolio.underlying_units * shocked.spot + portfolio.cash
    for position in portfolio.positions:
        decayed = replace(
            position.contract,
            time_to_expiry=max(0.0, position.contract.time_to_expiry - time_decay),
        )
        value += position.quantity * black_scholes_price(decayed, shocked)
    return value


def standard_stress_tests(portfolio: Portfolio, market: MarketData) -> list[dict[str, float | str]]:
    scenarios = [
        ("spot down 1%", -0.01, 0.0, 0.0, 0.0),
        ("spot up 1%", 0.01, 0.0, 0.0, 0.0),
        ("spot down 5%", -0.05, 0.0, 0.0, 0.0),
        ("spot up 5%", 0.05, 0.0, 0.0, 0.0),
        ("spot down 10%", -0.10, 0.0, 0.0, 0.0),
        ("spot up 10%", 0.10, 0.0, 0.0, 0.0),
        ("vol down 5 points", 0.0, -0.05, 0.0, 0.0),
        ("vol up 5 points", 0.0, 0.05, 0.0, 0.0),
        ("rate up 100 bp", 0.0, 0.0, 0.01, 0.0),
        ("one week decay", 0.0, 0.0, 0.0, 7.0 / 365.0),
        ("combined crash", -0.10, 0.10, -0.005, 7.0 / 365.0),
    ]
    base_value = portfolio_value(portfolio, market)
    rows: list[dict[str, float | str]] = []
    for label, spot, vol, rate, decay in scenarios:
        scenario_value = _scenario_value(portfolio, market, spot, vol, rate, decay)
        rows.append(
            {
                "label": label,
                "base_value": base_value,
                "scenario_value": scenario_value,
                "pnl": scenario_value - base_value,
            }
        )
    return rows

