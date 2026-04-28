from fastapi.testclient import TestClient

from api import main
from api.main import app


client = TestClient(app)


def option_payload(kind: str = "call", strike: float = 100.0) -> dict[str, object]:
    return {
        "option": {"kind": kind, "strike": strike, "time_to_expiry": 1.0, "exercise": "european"},
        "market": {"spot": 100.0, "rate": 0.05, "dividend_yield": 0.0, "volatility": 0.2},
    }


def test_price_endpoint():
    response = client.post("/price", json=option_payload())

    assert response.status_code == 200
    assert response.json()["price"] == 10.450583572185565


def test_greeks_endpoint():
    response = client.post("/greeks", json=option_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["delta"] > 0.0
    assert body["gamma"] > 0.0


def test_implied_vol_endpoint_recovers_vol():
    payload = option_payload()
    payload["option_price"] = 10.450583572185565

    response = client.post("/implied-vol", json=payload)

    assert response.status_code == 200
    assert abs(response.json()["implied_volatility"] - 0.2) < 1e-8


def test_invalid_input_returns_validation_error():
    payload = option_payload()
    payload["market"]["spot"] = -1.0  # type: ignore[index]

    response = client.post("/price", json=payload)

    assert response.status_code == 422


def test_portfolio_risk_and_stress_endpoints():
    portfolio_payload = {
        "positions": [
            {"option": {"kind": "call", "strike": 100.0, "time_to_expiry": 1.0}, "quantity": 10.0},
            {"option": {"kind": "put", "strike": 95.0, "time_to_expiry": 0.5}, "quantity": -4.0},
        ],
        "underlying_units": 25.0,
        "cash": -500.0,
        "market": {"spot": 100.0, "rate": 0.04, "dividend_yield": 0.0, "volatility": 0.22},
    }

    risk_response = client.post("/portfolio-risk", json=portfolio_payload)
    stress_response = client.post("/stress-test", json=portfolio_payload)

    assert risk_response.status_code == 200
    assert risk_response.json()["value"] > 0.0
    assert stress_response.status_code == 200
    assert any(row["label"] == "combined crash" for row in stress_response.json()["scenarios"])


def test_hedging_simulation_endpoint():
    payload = option_payload()
    payload["config"] = {"steps": 24, "rebalance_interval": 1, "seed": 3, "transaction_cost_rate": 0.001}

    response = client.post("/hedging-simulation", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert len(body["spot_path"]) == 25
    assert body["transaction_costs"] > 0.0


def test_vol_surface_endpoint():
    payload = {
        "spot": 100.0,
        "expiries": [0.5, 1.0],
        "strikes": [90.0, 100.0, 110.0],
        "query_strike": 100.0,
        "query_expiry": 0.75,
    }

    response = client.post("/vol-surface", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["interpolated_vol"] > 0.0
    assert body["quote_count"] == 6
    assert len(body["smile"]) == 3
    assert len(body["term_structure"]) == 2


def test_scenario_greeks_endpoint():
    payload = {
        "positions": [
            {"option": {"kind": "call", "strike": 100.0, "time_to_expiry": 1.0}, "quantity": 10.0},
        ],
        "underlying_units": 5.0,
        "market": {"spot": 100.0, "rate": 0.04, "dividend_yield": 0.0, "volatility": 0.22},
    }

    response = client.post("/scenario-greeks", json=payload)

    assert response.status_code == 200
    rows = response.json()["scenarios"]
    assert len(rows) >= 3
    assert {"label", "delta", "gamma", "vega", "theta", "rho"} <= set(rows[0])


def test_model_prices_endpoint():
    response = client.post("/model-prices", json=option_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["black_scholes"] > 0.0
    assert body["binomial"] > 0.0
    assert body["monte_carlo"] > 0.0
    assert body["local_vol"] > 0.0
    assert body["stochastic_vol"] > 0.0


def test_market_snapshot_endpoint(monkeypatch):
    def fake_fetch(ticker: str):
        assert ticker == "AAPL"
        return {
            "ticker": "AAPL",
            "price": 210.25,
            "previous_close": 208.0,
            "change": 2.25,
            "change_percent": 0.010817307692307692,
            "currency": "USD",
            "source": "Yahoo Finance",
            "timestamp": "2026-05-04T12:00:00+00:00",
            "option_expirations": ["2026-05-15", "2026-06-19"],
        }

    monkeypatch.setattr(main, "fetch_market_snapshot", fake_fetch)

    response = client.get("/market-snapshots/aapl")

    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["price"] == 210.25
    assert body["option_expirations"] == ["2026-05-15", "2026-06-19"]


def test_market_snapshot_rejects_bad_ticker():
    response = client.get("/market-snapshots/@bad")

    assert response.status_code == 422
