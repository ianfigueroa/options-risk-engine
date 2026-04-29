"""FastAPI service for the Options Risk Engine."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Literal, TypeVar

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.market_data import fetch_market_snapshot, fetch_nearest_option_quote, fetch_option_chain_quotes
from api.schemas import (
    HedgingConfigSchema,
    HedgingRequest,
    ImpliedVolRequest,
    LiveOptionQuote,
    MarketSnapshot,
    MarketSchema,
    OptionSchema,
    PortfolioRequest,
    PriceRequest,
    TickerSymbol,
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


@app.get("/market-snapshots/{ticker}", response_model=MarketSnapshot)
def market_snapshot(ticker: TickerSymbol) -> dict[str, Any]:
    return _safe(lambda: fetch_market_snapshot(ticker.upper()))


@app.get("/option-quotes/{ticker}", response_model=LiveOptionQuote)
def option_quote(
    ticker: TickerSymbol,
    kind: Literal["call", "put"] = Query(...),
    strike: float = Query(..., gt=0.0),
    expiry_years: float = Query(..., gt=0.0),
) -> dict[str, Any]:
    return _safe(lambda: fetch_nearest_option_quote(ticker.upper(), kind, strike, expiry_years))


@app.get("/live-vol-surface/{ticker}")
def live_vol_surface(
    ticker: TickerSymbol,
    kind: Literal["call", "put"] = Query(...),
    spot: float = Query(..., gt=0.0),
    rate: float = Query(0.04),
    dividend_yield: float = Query(0.0),
    query_strike: float = Query(..., gt=0.0),
    query_expiry: float = Query(..., gt=0.0),
    max_expirations: int = Query(4, ge=1, le=8),
    strike_window: float = Query(0.30, gt=0.0, le=2.0),
) -> dict[str, Any]:
    effective_window = min(2.0, max(strike_window, abs(query_strike / spot - 1.0) + 0.05))
    raw_quotes = _safe(
        lambda: fetch_option_chain_quotes(ticker.upper(), kind, spot, query_expiry, max_expirations, effective_window)
    )
    return _safe(
        lambda: _live_surface_response(
            raw_quotes,
            kind=kind,
            spot=spot,
            rate=rate,
            dividend_yield=dividend_yield,
            query_strike=query_strike,
            query_expiry=query_expiry,
        )
    )


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


def _live_surface_response(
    raw_quotes: list[dict[str, Any]],
    *,
    kind: str,
    spot: float,
    rate: float,
    dividend_yield: float,
    query_strike: float,
    query_expiry: float,
) -> dict[str, Any]:
    quotes: list[ol.VolQuote] = []
    failed: list[dict[str, Any]] = []
    market = ol.MarketData(spot=spot, rate=rate, dividend_yield=dividend_yield, volatility=0.20)
    for raw in raw_quotes:
        mid = raw.get("mid")
        if not isinstance(mid, int | float) or mid <= 0.0:
            failed.append({"strike": raw.get("strike"), "expiry": raw.get("expiry_years"), "reason": "missing mid"})
            continue
        strike = float(raw["strike"])
        expiry = float(raw["expiry_years"])
        try:
            iv = ol.implied_volatility(ol.OptionContract(kind=kind, strike=strike, time_to_expiry=expiry), market, mid)
        except ValueError as exc:
            failed.append({"strike": strike, "expiry": expiry, "reason": str(exc)})
            continue
        bid = float(raw.get("bid") or 0.0)
        ask = float(raw.get("ask") or mid)
        quotes.append(ol.VolQuote(strike=strike, expiry=expiry, implied_vol=iv, bid=bid, ask=ask))

    if not quotes:
        raise ValueError("no live option quotes could be converted into implied volatility")

    expiries = sorted({quote.expiry for quote in quotes})
    strikes = sorted({quote.strike for quote in quotes})
    smile_expiry = min(expiries, key=lambda expiry: abs(expiry - query_expiry))
    term_strike = min(strikes, key=lambda strike: abs(strike - query_strike))
    warnings: list[str] = []
    interpolated = _interpolate_live_surface(quotes, query_strike, query_expiry, warnings)
    surface = ol.VolSurface(quotes)
    return {
        "source": "Yahoo Finance option chain",
        "interpolated_vol": interpolated,
        "quote_count": len(quotes),
        "failed_quote_count": len(failed),
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
        "suspicious_quotes": surface.detect_suspicious_quotes() + failed,
        "arbitrage_warnings": surface.arbitrage_warnings() + warnings,
    }


def _interpolate_live_surface(
    quotes: list[ol.VolQuote],
    query_strike: float,
    query_expiry: float,
    warnings: list[str],
) -> float:
    by_expiry: dict[float, set[float]] = {}
    for quote in quotes:
        by_expiry.setdefault(quote.expiry, set()).add(quote.strike)
    common_strikes = set.intersection(*by_expiry.values())
    if len(common_strikes) >= 2 and len(by_expiry) >= 2:
        expiries = sorted(by_expiry)
        strikes = sorted(common_strikes)
        clamped_strike = min(max(query_strike, strikes[0]), strikes[-1])
        clamped_expiry = min(max(query_expiry, expiries[0]), expiries[-1])
        if clamped_strike != query_strike or clamped_expiry != query_expiry:
            warnings.append("query was clamped to the live surface domain")
        grid_quotes = [quote for quote in quotes if quote.strike in common_strikes]
        return ol.VolSurface(grid_quotes).interpolate(clamped_strike, clamped_expiry)
    nearest = min(quotes, key=lambda quote: abs(quote.strike - query_strike) + abs(quote.expiry - query_expiry))
    warnings.append("live surface used nearest quote because a rectangular grid was unavailable")
    return nearest.implied_vol
