from types import SimpleNamespace

import pandas as pd

from api import market_data


def install_fake_yfinance(monkeypatch, ticker_factory):
    monkeypatch.setattr(market_data, "YAHOO_MIN_REQUEST_INTERVAL_SECONDS", 0.0)
    monkeypatch.setattr(market_data, "_live_cache", market_data.TtlCache(now=lambda: 10.0))
    monkeypatch.setitem(
        __import__("sys").modules,
        "yfinance",
        SimpleNamespace(Ticker=ticker_factory),
    )


def test_market_snapshot_parses_fast_info_and_options(monkeypatch):
    class FakeTicker:
        fast_info = {"last_price": 212.5, "previous_close": 210.0}
        info = {"currency": "USD"}
        options = ["2026-06-19", "2026-09-18"]

    install_fake_yfinance(monkeypatch, lambda symbol: FakeTicker())

    snapshot = market_data.fetch_market_snapshot("aapl")

    assert snapshot["ticker"] == "AAPL"
    assert snapshot["price"] == 212.5
    assert snapshot["change"] == 2.5
    assert snapshot["change_percent"] == 2.5 / 210.0
    assert snapshot["option_expirations"] == ["2026-06-19", "2026-09-18"]


def test_option_quote_selects_nearest_contract_and_uses_bid_ask_mid(monkeypatch):
    calls = pd.DataFrame(
        [
            {"strike": 95.0, "bid": 7.0, "ask": 7.4, "lastPrice": 7.2, "impliedVolatility": 0.25, "volume": 12, "openInterest": 100},
            {"strike": 100.0, "bid": 4.0, "ask": 4.4, "lastPrice": 4.1, "impliedVolatility": 0.27, "volume": 20, "openInterest": 200},
        ]
    )

    class FakeTicker:
        options = ["2026-06-19"]

        def option_chain(self, expiration):
            assert expiration == "2026-06-19"
            return SimpleNamespace(calls=calls, puts=pd.DataFrame())

    install_fake_yfinance(monkeypatch, lambda symbol: FakeTicker())

    quote = market_data.fetch_nearest_option_quote("AAPL", "call", strike=99.0, expiry_years=0.1)

    assert quote["matched_strike"] == 100.0
    assert quote["mid"] == 4.2
    assert quote["implied_volatility"] == 0.27
    assert quote["volume"] == 20
    assert quote["open_interest"] == 200


def test_option_chain_ladder_returns_calls_and_puts_in_strike_window(monkeypatch):
    calls = pd.DataFrame(
        [
            {"strike": 80.0, "bid": 20.0, "ask": 21.0, "lastPrice": 20.5, "impliedVolatility": 0.35, "volume": 3, "openInterest": 30},
            {"strike": 100.0, "bid": 5.0, "ask": 5.4, "lastPrice": 5.2, "impliedVolatility": 0.25, "volume": 10, "openInterest": 100},
            {"strike": 105.0, "bid": 3.0, "ask": 3.4, "lastPrice": 3.2, "impliedVolatility": 0.26, "volume": 11, "openInterest": 110},
        ]
    )
    puts = pd.DataFrame(
        [
            {"strike": 100.0, "bid": 4.0, "ask": 4.2, "lastPrice": 4.1, "impliedVolatility": 0.24, "volume": 9, "openInterest": 90},
            {"strike": 105.0, "bid": 6.0, "ask": 6.4, "lastPrice": 6.2, "impliedVolatility": 0.27, "volume": 12, "openInterest": 120},
        ]
    )

    class FakeTicker:
        options = ["2026-06-19"]

        def option_chain(self, expiration):
            assert expiration == "2026-06-19"
            return SimpleNamespace(calls=calls, puts=puts)

    install_fake_yfinance(monkeypatch, lambda symbol: FakeTicker())

    ladder = market_data.fetch_option_chain_ladder("MSFT", spot=100.0, query_expiry=0.1, strike_window=0.06)

    assert ladder["expiration"] == "2026-06-19"
    assert [row["strike"] for row in ladder["rows"]] == [100.0, 105.0]
    assert ladder["rows"][0]["call"]["mid"] == 5.2
    assert ladder["rows"][0]["put"]["mid"] == 4.1
    assert ladder["rows"][1]["put"]["open_interest"] == 120


def test_window_quotes_falls_back_to_nearest_strike_when_window_is_empty():
    quotes = pd.DataFrame(
        [
            {"strike": 50.0, "bid": 1.0, "ask": 1.2},
            {"strike": 150.0, "bid": 2.0, "ask": 2.2},
        ]
    )

    window = market_data._window_quotes(quotes, spot=100.0, lower_strike=90.0, upper_strike=110.0)

    assert len(window) == 1
    assert float(window.iloc[0]["strike"]) == 50.0
