"""FastAPI service for the Options Risk Engine."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.schemas import (
    HedgingConfigSchema,
    HedgingRequest,
    ImpliedVolRequest,
    MarketSchema,
    OptionSchema,
    PortfolioRequest,
    PriceRequest,
    VolSurfaceRequest,
)
from options_lab import analytics as ol

app = FastAPI(title="Options Risk Engine API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)
T = TypeVar("T")


def _option(schema: OptionSchema) -> ol.OptionContract:
    return ol.OptionContract(
        kind=schema.kind,
        strike=schema.strike,
        time_to_expiry=schema.time_to_expiry,
        exercise=schema.exercise,
    )


def _market(schema: MarketSchema) -> ol.MarketData:
    return ol.MarketData(
        spot=schema.spot,
        rate=schema.rate,
        dividend_yield=schema.dividend_yield,
        volatility=schema.volatility,
    )


def _hedging_config(schema: HedgingConfigSchema) -> ol.HedgingConfig:
    return ol.HedgingConfig(
        steps=schema.steps,
        rebalance_interval=schema.rebalance_interval,
        seed=schema.seed,
        assumed_volatility=schema.assumed_volatility,
        realized_volatility=schema.realized_volatility,
        transaction_cost_rate=schema.transaction_cost_rate,
        jump_intensity=schema.jump_intensity,
        jump_mean=schema.jump_mean,
        jump_stddev=schema.jump_stddev,
    )


def _portfolio(payload: PortfolioRequest) -> ol.Portfolio:
    return ol.Portfolio(
        positions=[
            ol.Position(contract=_option(position.option), quantity=position.quantity)
            for position in payload.positions
        ],
        underlying_units=payload.underlying_units,
        cash=payload.cash,
    )


def _safe(call: Callable[[], T]) -> T:
    try:
        return call()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/price")
def price(payload: PriceRequest) -> dict[str, float]:
    return {
        "price": _safe(lambda: ol.black_scholes_price(_option(payload.option), _market(payload.market)))
    }


@app.post("/greeks")
def greeks(payload: PriceRequest) -> dict[str, float]:
    values = _safe(lambda: ol.black_scholes_greeks(_option(payload.option), _market(payload.market)))
    return values.__dict__


@app.post("/implied-vol")
def implied_vol(payload: ImpliedVolRequest) -> dict[str, float]:
    iv = _safe(
        lambda: ol.implied_volatility(
            _option(payload.option),
            _market(payload.market),
            payload.option_price,
            initial_guess=payload.initial_guess,
        )
    )
    return {"implied_volatility": iv}


@app.post("/portfolio-risk")
def portfolio_risk(payload: PortfolioRequest) -> dict[str, Any]:
    portfolio = _portfolio(payload)
    market = _market(payload.market)
    value = _safe(lambda: ol.portfolio_value(portfolio, market))
    greeks_value = _safe(lambda: ol.portfolio_greeks(portfolio, market))
    return {"value": value, "greeks": greeks_value.__dict__}


@app.post("/stress-test")
def stress_test(payload: PortfolioRequest) -> dict[str, list[dict[str, float | str]]]:
    scenarios = _safe(lambda: ol.standard_stress_tests(_portfolio(payload), _market(payload.market)))
    return {"scenarios": scenarios}


@app.post("/scenario-greeks")
def scenario_greeks(payload: PortfolioRequest) -> dict[str, list[dict[str, float | str]]]:
    scenarios = [
        ol.Scenario("base", 0.0, 0.0, 0.0, 0.0),
        ol.Scenario("spot up 5%", 0.05, 0.0, 0.0, 0.0),
        ol.Scenario("spot down 5%", -0.05, 0.0, 0.0, 0.0),
        ol.Scenario("vol up 5 points", 0.0, 0.05, 0.0, 0.0),
        ol.Scenario("one week decay", 0.0, 0.0, 0.0, 7.0 / 365.0),
    ]
    rows = _safe(lambda: ol.scenario_greeks(_portfolio(payload), _market(payload.market), scenarios))
    return {"scenarios": rows}


@app.post("/model-prices")
def model_prices(payload: PriceRequest) -> dict[str, float]:
    option = _option(payload.option)
    market = _market(payload.market)
    paths = ol.PathConfig(paths=6000, steps=40, seed=31)
    return _safe(
        lambda: {
            "black_scholes": ol.black_scholes_price(option, market),
            "binomial": ol.binomial_tree_price(option, market, steps=300),
            "monte_carlo": ol.monte_carlo_price(option, market, paths=6000, seed=31),
            "local_vol": ol.local_vol_monte_carlo_price(
                option,
                market,
                ol.LocalVolModel(base_volatility=market.volatility, spot_slope=0.15),
                paths,
            ),
            "stochastic_vol": ol.stochastic_vol_monte_carlo_price(
                option,
                market,
                ol.HestonParams(
                    initial_variance=market.volatility * market.volatility,
                    long_run_variance=market.volatility * market.volatility,
                ),
                paths,
            ),
        }
    )


@app.post("/hedging-simulation")
def hedging_simulation(payload: HedgingRequest) -> dict[str, Any]:
    result = _safe(
        lambda: ol.simulate_delta_hedge(
            _option(payload.option),
            _market(payload.market),
            _hedging_config(payload.config),
        )
    )
    return result.__dict__


@app.post("/vol-surface")
def vol_surface(payload: VolSurfaceRequest) -> dict[str, Any]:
    quotes = ol.synthetic_option_chain(payload.spot, payload.expiries, payload.strikes)
    surface = ol.VolSurface(quotes)
    interpolated = _safe(lambda: surface.interpolate(payload.query_strike, payload.query_expiry))
    smile_expiry = min(payload.expiries, key=lambda expiry: abs(expiry - payload.query_expiry))
    term_strike = min(payload.strikes, key=lambda strike: abs(strike - payload.query_strike))
    return {
        "interpolated_vol": interpolated,
        "quote_count": len(quotes),
        "smile": [
            {"strike": quote.strike, "implied_vol": quote.implied_vol}
            for quote in quotes
            if quote.expiry == smile_expiry
        ],
        "term_structure": [
            {"expiry": quote.expiry, "implied_vol": quote.implied_vol}
            for quote in quotes
            if quote.strike == term_strike
        ],
        "suspicious_quotes": surface.detect_suspicious_quotes(),
        "arbitrage_warnings": surface.arbitrage_warnings(),
    }
