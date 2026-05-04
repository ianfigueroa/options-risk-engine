import math

import pytest

from options_lab import analytics as ol
from options_lab.analytics import pricing


@pytest.fixture(autouse=True)
def use_python_fallback(monkeypatch):
    monkeypatch.setattr(pricing, "CORE_AVAILABLE", False)


def test_python_fallback_prices_greeks_and_implied_volatility():
    market = ol.MarketData(spot=100.0, rate=0.05, dividend_yield=0.01, volatility=0.24)
    call = ol.OptionContract(kind="call", strike=105.0, time_to_expiry=0.75)
    put = ol.OptionContract(kind="put", strike=105.0, time_to_expiry=0.75)

    call_price = ol.black_scholes_price(call, market)
    put_price = ol.black_scholes_price(put, market)
    greeks = ol.black_scholes_greeks(call, market)

    parity = market.spot * math.exp(-market.dividend_yield * call.time_to_expiry)
    parity -= call.strike * math.exp(-market.rate * call.time_to_expiry)
    assert call_price - put_price == pytest.approx(parity, abs=1e-10)
    assert greeks.delta > 0.0
    assert greeks.gamma > 0.0
    assert greeks.vega > 0.0
    assert ol.implied_volatility(call, market, call_price, initial_guess=0.15) == pytest.approx(0.24)


def test_python_fallback_handles_expiry_zero_volatility_and_bounds():
    expired_call = ol.OptionContract(kind="call", strike=95.0, time_to_expiry=0.0)
    zero_vol_market = ol.MarketData(spot=100.0, rate=0.05, dividend_yield=0.0, volatility=0.0)

    assert ol.black_scholes_price(expired_call, zero_vol_market) == 5.0
    assert ol.black_scholes_greeks(expired_call, zero_vol_market) == ol.Greeks()

    call = ol.OptionContract(kind="call", strike=100.0, time_to_expiry=1.0)
    lower, upper = ol.no_arbitrage_bounds(call, zero_vol_market)
    assert lower == pytest.approx(100.0 - 100.0 * math.exp(-0.05))
    assert upper == 100.0
    with pytest.raises(ValueError, match="undefined at expiry"):
        ol.implied_volatility(expired_call, zero_vol_market, 5.0)


def test_python_fallback_numerical_models_validate_and_return_prices():
    contract = ol.OptionContract(kind="call", strike=100.0, time_to_expiry=0.5)
    market = ol.MarketData(spot=100.0, rate=0.04, dividend_yield=0.0, volatility=0.20)
    path_config = ol.PathConfig(paths=64, steps=8, seed=7)

    assert ol.binomial_tree_price(contract, market, steps=50) > 0.0
    assert ol.monte_carlo_price(contract, market, paths=64, seed=7) > 0.0
    assert ol.local_volatility(ol.LocalVolModel(base_volatility=0.2), 101.0, 100.0, 0.1) > 0.0
    assert ol.local_vol_monte_carlo_price(
        contract,
        market,
        ol.LocalVolModel(base_volatility=0.2, spot_slope=0.1),
        path_config,
    ) > 0.0
    assert ol.stochastic_vol_monte_carlo_price(
        contract,
        market,
        ol.HestonParams(initial_variance=0.04, long_run_variance=0.04),
        path_config,
    ) > 0.0

    with pytest.raises(ValueError, match="steps"):
        ol.binomial_tree_price(contract, market, steps=0)
    with pytest.raises(ValueError, match="paths"):
        ol.monte_carlo_price(contract, market, paths=0)
    with pytest.raises(ValueError, match="levels"):
        ol.local_volatility(ol.LocalVolModel(base_volatility=0.0), 100.0, 100.0, 0.0)
    with pytest.raises(ValueError, match="cap"):
        ol.local_volatility(ol.LocalVolModel(min_volatility=0.5, max_volatility=0.2), 100.0, 100.0, 0.0)
    with pytest.raises(ValueError, match="path count"):
        ol.local_vol_monte_carlo_price(contract, market, ol.LocalVolModel(), ol.PathConfig(paths=0, steps=1))
    with pytest.raises(ValueError, match="correlation"):
        ol.stochastic_vol_monte_carlo_price(contract, market, ol.HestonParams(correlation=2.0), path_config)
    with pytest.raises(ValueError, match="path count"):
        ol.stochastic_vol_monte_carlo_price(contract, market, ol.HestonParams(), ol.PathConfig(paths=1, steps=0))


def test_domain_dataclasses_reject_invalid_values():
    with pytest.raises(ValueError, match="kind"):
        ol.OptionContract(kind="straddle")
    with pytest.raises(ValueError, match="exercise"):
        ol.OptionContract(exercise="bermudan")
    with pytest.raises(ValueError, match="strike"):
        ol.OptionContract(strike=0.0)
    with pytest.raises(ValueError, match="time_to_expiry"):
        ol.OptionContract(time_to_expiry=-0.01)
    with pytest.raises(ValueError, match="spot"):
        ol.MarketData(spot=0.0)
    with pytest.raises(ValueError, match="volatility"):
        ol.MarketData(volatility=-0.01)
