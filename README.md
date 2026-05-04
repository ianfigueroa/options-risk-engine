# Options Risk Engine + Vol Surface Lab

This is a small options analytics desk tool. It lets you price options, solve
implied volatility, inspect Greeks, build volatility surfaces, stress a simple
portfolio, compare pricing models, and simulate delta hedging.

The project has four main parts:

- A C++20 numerical core for pricing and risk calculations.
- A Python analytics layer that can use the C++ extension or fall back to pure
  Python.
- A FastAPI service that exposes the analytics as local API routes.
- A React dashboard for exploring trades, market quotes, option chains, stress
  results, surfaces, and hedging paths.

It is meant for learning, demos, and portfolio-style exploration. It is not a
production trading system.

## What You Can Do

- Price European calls and puts.
- Price American-style options with a binomial tree.
- Calculate Delta, Gamma, Vega, Theta, and Rho.
- Recover implied volatility from an option price.
- Pull demo-grade stock and option-chain data from Yahoo Finance.
- Build synthetic or live volatility surface views.
- Reprice a portfolio under stress scenarios.
- Compare Black-Scholes, binomial, Monte Carlo, local-vol, and stochastic-vol
  model prices.
- Run delta-hedging simulations with transaction costs and jumps.

## Project Layout

- `cpp/`: C++ pricing and risk engine.
- `python/options_lab/`: Python analytics package and optional native binding.
- `api/`: FastAPI app.
- `frontend/`: React and TypeScript dashboard.
- `notebooks/`: Research notebooks.
- `docs/`: Architecture, model, method, and benchmark notes.
- `reports/`: Research output.

## Run It Locally

Install the Python/API layer:

```powershell
py -3 -m pip install -e .[dev]
```

Start the API:

```powershell
py -3 -m uvicorn --app-dir C:\Users\Ianfi\Options_Risk_Engine api.main:app --host 127.0.0.1 --port 8000
```

Start the dashboard:

```powershell
cd frontend
npm ci
npm run dev
```

Open:

- API: `http://127.0.0.1:8000`
- Dashboard: `http://127.0.0.1:5173`

## Optional C++ Build

The app can run through the Python layer, but the native C++ core can also be
built locally:

```powershell
cmake -S . -B build -G "MinGW Makefiles"
cmake --build build
```

## Docker

For a one-command local demo:

```powershell
docker compose up --build
```

That starts:

- FastAPI on `http://127.0.0.1:8000`
- Vite dashboard on `http://127.0.0.1:5173`

## Live Market Data

Live stock and option-chain data comes from Yahoo Finance through `yfinance`.
That is useful for demos and exploration, but it is not exchange-grade market
data.

The API caches and paces Yahoo requests by default:

- market snapshot cache: 60 seconds
- nearest option quote cache: 120 seconds
- option-chain cache: 300 seconds
- Yahoo request spacing: 2.5 seconds

You can tune those values with environment variables:

```powershell
$env:OPTIONS_YAHOO_MIN_INTERVAL_SECONDS="2.5"
$env:OPTIONS_MARKET_SNAPSHOT_TTL_SECONDS="60"
$env:OPTIONS_OPTION_QUOTE_TTL_SECONDS="120"
$env:OPTIONS_OPTION_CHAIN_TTL_SECONDS="300"
```

## Notes

- The dashboard defaults to European options with no discrete dividends.
- Yahoo Finance data is for exploration, not trading.
- Local volatility is parametric rather than a full Dupire calibration.
- Stochastic volatility uses simulation rather than a calibrated Heston pricer.
- Static-arbitrage checks are basic diagnostics, not a full surface-cleaning
  framework.
