from api.market_data import TtlCache


def test_ttl_cache_reuses_value_until_expiry():
    now = [100.0]
    cache = TtlCache(now=lambda: now[0])
    calls = 0

    def loader():
        nonlocal calls
        calls += 1
        return {"price": 101.0}

    assert cache.get_or_load(("snapshot", "AAPL"), ttl_seconds=30.0, loader=loader) == {"price": 101.0}
    assert cache.get_or_load(("snapshot", "AAPL"), ttl_seconds=30.0, loader=loader) == {"price": 101.0}
    assert calls == 1

    now[0] = 131.0
    assert cache.get_or_load(("snapshot", "AAPL"), ttl_seconds=30.0, loader=loader) == {"price": 101.0}
    assert calls == 2


def test_ttl_cache_returns_copies():
    cache = TtlCache(now=lambda: 10.0)

    first = cache.get_or_load(("quote", "MSFT"), ttl_seconds=60.0, loader=lambda: {"quotes": [1, 2]})
    first["quotes"].append(3)

    second = cache.get_or_load(("quote", "MSFT"), ttl_seconds=60.0, loader=lambda: {"quotes": []})
    assert second == {"quotes": [1, 2]}
