import math

import pytest

from options_lab import analytics as ol


def market(volatility: float = 0.2) -> ol.MarketData:
    return ol.MarketData(spot=100.0, rate=0.05, dividend_yield=0.0, volatility=volatility)


def option(kind: str = "call", strike: float = 100.0) -> ol.OptionContract:
    return ol.OptionContract(kind=kind, strike=strike, time_to_expiry=1.0)


def test_black_scholes_known_prices_and_parity():
    call = option("call")
    put = option("put")
    md = market()

    assert ol.black_scholes_price(call, md) == pytest.approx(10.4506, abs=1e-4)
    assert ol.black_scholes_price(put, md) == pytest.approx(5.5735, abs=1e-4)

    lhs = ol.black_scholes_price(call, md) - ol.black_scholes_price(put, md)
    rhs = md.spot - call.strike * math.exp(-md.rate * call.time_to_expiry)
    assert lhs == pytest.approx(rhs, abs=1e-10)


def test_greeks_and_implied_volatility():
    contract = option("call", 105.0)
    md = market(0.31)
    price = ol.black_scholes_price(contract, md)

    greeks = ol.black_scholes_greeks(contract, md)
    assert greeks.delta > 0.0
    assert greeks.gamma > 0.0
    assert greeks.vega > 0.0

    solved = ol.implied_volatility(contract, md, price, initial_guess=0.15)
    assert solved == pytest.approx(0.31, abs=1e-8)


def test_implied_volatility_rejects_bad_price():
    with pytest.raises(ValueError, match="bounds"):
        ol.implied_volatility(option("call"), market(), -1.0)


def test_portfolio_and_stress_tests():
    portfolio = ol.Portfolio(
        positions=[
            ol.Position(option("call", 100.0), 10.0),
            ol.Position(option("put", 95.0), -4.0),
        ],
        underlying_units=25.0,
        cash=-500.0,
    )
    md = market(0.22)

    value = ol.portfolio_value(portfolio, md)
    greeks = ol.portfolio_greeks(portfolio, md)
    stresses = ol.standard_stress_tests(portfolio, md)

    assert value > 0.0
    assert greeks.delta > 0.0
    assert any(row["label"] == "combined crash" for row in stresses)


def test_scenario_greeks_matrix():
    portfolio = ol.Portfolio(
        positions=[ol.Position(option("call", 100.0), 10.0)],
        underlying_units=5.0,
    )
    md = market(0.22)

    rows = ol.scenario_greeks(
        portfolio,
        md,
        [
            ol.Scenario("base", 0.0, 0.0, 0.0, 0.0),
            ol.Scenario("spot up", 0.05, 0.0, 0.0, 0.0),
        ],
    )

    assert len(rows) == 2
    assert rows[0]["label"] == "base"
    assert rows[0]["delta"] == pytest.approx(ol.portfolio_greeks(portfolio, md).delta)
    assert rows[1]["delta"] != pytest.approx(rows[0]["delta"])


def test_vol_surface_interpolation_and_quote_checks():
    quotes = ol.synthetic_option_chain(spot=100.0, expiries=[0.5, 1.0], strikes=[90.0, 100.0, 110.0])
    surface = ol.VolSurface(quotes)

    assert surface.interpolate(100.0, 0.75) > 0.0

    bad_quotes = quotes + [ol.VolQuote(strike=120.0, expiry=1.0, implied_vol=-0.1, bid=2.0, ask=1.0)]
    warnings = ol.VolSurface(bad_quotes).detect_suspicious_quotes()
    assert len(warnings) >= 1


def test_csv_option_chain_loader(tmp_path):
    chain = tmp_path / "chain.csv"
    chain.write_text(
        "strike,expiry,implied_vol,bid,ask\n"
        "90,0.5,0.24,1.0,1.2\n"
        "100,0.5,0.22,1.0,1.1\n",
        encoding="utf-8",
    )

    quotes = ol.load_option_chain_csv(chain)

    assert len(quotes) == 2
    assert quotes[0].strike == 90.0
    assert quotes[1].implied_vol == 0.22


def test_local_and_stochastic_vol_prices_are_finite():
    contract = option("call")
    md = market(0.2)
    path_config = ol.PathConfig(paths=5000, steps=30, seed=5)

    local = ol.local_vol_monte_carlo_price(
        contract,
        md,
        ol.LocalVolModel(base_volatility=0.2, spot_slope=0.15),
        path_config,
    )
    stochastic = ol.stochastic_vol_monte_carlo_price(
        contract,
        md,
        ol.HestonParams(initial_variance=0.04, long_run_variance=0.04),
        path_config,
    )

    assert local > 0.0
    assert stochastic > 0.0


def test_hedging_simulation_outputs_path_and_costs():
    contract = option("call")
    md = market(0.2)

    result = ol.simulate_delta_hedge(
        contract,
        md,
        ol.HedgingConfig(steps=24, rebalance_interval=1, seed=9, transaction_cost_rate=0.001),
    )

    assert len(result.spot_path) == 25
    assert len(result.delta_path) == 25
    assert result.transaction_costs > 0.0
    assert math.isfinite(result.hedging_error)


def test_cpp_core_status_is_exposed():
    status = ol.cpp_core_status()

    assert set(status) == {"available", "backend"}
    assert status["backend"] in {"cpp", "python"}
