# Options Risk Engine + Vol Surface Lab

This is an options analytics project built to feel like a small desk tool, not a
toy Black-Scholes calculator. It prices options, solves implied volatility,
builds volatility surfaces, aggregates portfolio Greeks, runs stress scenarios,
and simulates delta hedging. The C++ core is there for the numerical engine; the
Python, FastAPI, and React layers make it usable and inspectable.

The main idea is simple: choose a contract, decide what volatility mark you want
to price with, and see how that choice flows through value, Greeks, risk, stress,
surface, and hedging results.

## What is inside

- `cpp/`: C++20 pricing/risk core, tests, and benchmark executable.
- `python/options_lab/`: Python analytics layer plus optional pybind11 loader.
- `api/`: FastAPI service for pricing, Greeks, IV, portfolio risk, live chains,
  stress tests, surfaces, and hedging.
- `frontend/`: React + TypeScript dashboard with live market data, strike
  presets, option-chain selection, interactive payoff inspection, stress heatmap,
  vol smile/term views, and hedging output.
- `notebooks/`: Research notebooks for pricing, IV, surfaces, portfolio Greeks,
  and hedging.
- `docs/`: Architecture, math, numerical methods, risk methodology, and
  benchmark notes.
- `reports/`: Delta-hedging error report.

## Quick start

Build and test the C++ core:

```powershell
cmake -S . -B build -G "MinGW Makefiles"
cmake --build build
ctest --test-dir build --output-on-failure
```

Install and test the Python/API layer:

```powershell
py -3 -m pip install -e .[dev]
py -3 -m pytest
```

Run the API:

```powershell
py -3 -m uvicorn --app-dir C:\Users\Ianfi\Options_Risk_Engine api.main:app --host 127.0.0.1 --port 8000
```

Run the dashboard:

```powershell
cd frontend
npm install
npm run dev
```

Open:

- API: `http://127.0.0.1:8000`
- Dashboard: `http://127.0.0.1:5173`

## Docker

For a one-command local demo:

```powershell
docker compose up --build
```

That starts:

- FastAPI on `http://127.0.0.1:8000`
- Vite dashboard on `http://127.0.0.1:5173`

The Docker setup uses the Python analytics package in the API container. The
native C++ extension is optional locally and is not required for the dashboard
demo container.

## Live market data

Live stock and option-chain data comes from Yahoo Finance through `yfinance`.
That is good enough for a portfolio demo and model exploration, but it is not
exchange-grade market data. The API protects the upstream source with:

- market snapshot cache: 60 seconds
- nearest option quote cache: 120 seconds
- option-chain cache: 300 seconds
- request pacing: 1 Yahoo request every 2.5 seconds by default

These values can be changed with:

```powershell
$env:OPTIONS_YAHOO_MIN_INTERVAL_SECONDS="2.5"
$env:OPTIONS_MARKET_SNAPSHOT_TTL_SECONDS="60"
$env:OPTIONS_OPTION_QUOTE_TTL_SECONDS="120"
$env:OPTIONS_OPTION_CHAIN_TTL_SECONDS="300"
```

## API routes

- `GET /health`
- `GET /market-snapshots/{ticker}`
- `GET /option-quotes/{ticker}`
- `GET /option-chain/{ticker}`
- `GET /live-vol-surface/{ticker}`
- `POST /price`
- `POST /greeks`
- `POST /implied-vol`
- `POST /portfolio-risk`
- `POST /stress-test`
- `POST /scenario-greeks`
- `POST /model-prices`
- `POST /hedging-simulation`
- `POST /vol-surface`

Request bodies and query parameters are validated with Pydantic. Domain errors,
such as impossible implied-volatility bounds, come back as clear HTTP 400
responses.

## Core math

Black-Scholes uses the standard continuous-dividend form:

```text
C = S e^{-qT} N(d1) - K e^{-rT} N(d2)
P = K e^{-rT} N(-d2) - S e^{-qT} N(-d1)
d1 = [ln(S/K) + (r - q + 0.5 sigma^2)T] / (sigma sqrt(T))
d2 = d1 - sigma sqrt(T)
```

The IV solver validates no-arbitrage bounds, starts with Newton-Raphson using
analytical vega, and falls back to bisection if Newton becomes unstable.

Portfolio stress tests use full repricing, not just Greek approximations. Greeks
are still shown because they explain the shape of the risk.

## Benchmarks

Measured locally on 2026-05-04:

| Benchmark | Size | Time |
|---|---:|---:|
| C++ Black-Scholes | 1,000 options | 0.175 ms |
| C++ Black-Scholes | 100,000 options | 17.555 ms |
| Python Black-Scholes | 1,000 options | 2.282 ms |
| Python Black-Scholes | 100,000 options | 223.526 ms |

See `docs/benchmarks.md` for the benchmark commands and Monte Carlo timings.

## Current scope

Implemented:

- European calls and puts
- American-style pricing through the binomial tree
- Black-Scholes, binomial tree, Monte Carlo, local-vol Monte Carlo, and
  stochastic-vol Monte Carlo
- analytical Greeks and portfolio Greeks
- implied-volatility recovery
- synthetic and live volatility surfaces
- option-chain selection in the dashboard
- portfolio repricing stress tests
- delta-hedging simulation with transaction costs and jumps
- C++ tests, Python/API tests, benchmarks, notebooks, docs, and report

Limitations:

- The dashboard defaults to European, no-discrete-dividend assumptions.
- Yahoo/yfinance is demo-grade data, not a production market-data feed.
- Local volatility is parametric; it is not a full Dupire calibration.
- Stochastic volatility uses simulation; it is not a calibrated Heston desk
  pricer.
- Static-arbitrage checks are basic diagnostics, not a full surface-cleaning
  framework.
