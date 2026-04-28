# Options Risk Engine + Vol Surface Lab

A production-style derivatives analytics platform for option pricing, Greeks,
implied volatility, volatility surfaces, portfolio risk, stress testing, and
delta-hedging experiments.

## Components

- `cpp/`: C++20 pricing and risk core with tests and benchmarks.
- `python/options_lab/`: Python analytics layer and C++ binding loader.
- `api/`: FastAPI service exposing pricing, Greeks, IV, risk, and hedging.
- `frontend/`: React + TypeScript dashboard.
- `docs/`: Architecture, models, numerical methods, risk methodology, and benchmarks.
- `reports/`: Research write-up on discrete delta hedging error.

## Quick Start

```powershell
cmake -S . -B build -G "MinGW Makefiles"
cmake --build build
ctest --test-dir build --output-on-failure
```

```powershell
py -3 -m pip install -e .[dev]
py -3 -m pytest
```

```powershell
uvicorn api.main:app --reload
```

```powershell
cd frontend
npm install
npm run dev
```

The API defaults to `http://127.0.0.1:8000`. The dashboard defaults to Vite on
`http://127.0.0.1:5173`.

## API Routes

- `POST /price`
- `POST /greeks`
- `POST /implied-vol`
- `POST /portfolio-risk`
- `POST /stress-test`
- `POST /scenario-greeks`
- `POST /model-prices`
- `POST /hedging-simulation`
- `POST /vol-surface`

Every route validates request bodies with Pydantic. Domain errors such as
invalid implied-volatility bounds are returned as HTTP 400 responses.

## Core Math

Black-Scholes uses:

```text
C = S e^{-qT} N(d1) - K e^{-rT} N(d2)
P = K e^{-rT} N(-d2) - S e^{-qT} N(-d1)
d1 = [ln(S/K) + (r - q + 0.5 sigma^2)T] / (sigma sqrt(T))
d2 = d1 - sigma sqrt(T)
```

The IV solver validates no-arbitrage bounds, runs Newton-Raphson with analytical
vega, and falls back to bisection if Newton leaves the bracket or vega is small.

Portfolio PnL stress tests use full repricing rather than only Greek
approximation. Greeks are still exposed for explainability and scenario
sensitivity.

## Benchmarks

Measured locally on 2026-05-04:

| Benchmark | Size | Time |
|---|---:|---:|
| C++ Black-Scholes | 1,000 options | 0.175 ms |
| C++ Black-Scholes | 100,000 options | 17.555 ms |
| Python Black-Scholes | 1,000 options | 2.282 ms |
| Python Black-Scholes | 100,000 options | 223.526 ms |

See `docs/benchmarks.md` for commands and Monte Carlo timings.

## Model Scope

The core focuses on equity-style options with Black-Scholes, CRR binomial
trees, GBM Monte Carlo, a parametric local-volatility Monte Carlo, and a
Heston-style stochastic-volatility Monte Carlo. Portfolio risk is computed by
full repricing, with separate scenario Greeks for shocked conditions.

## Limitations

- No static-arbitrage surface calibration beyond basic quote diagnostics.
- No discrete dividends, borrow curves, stochastic rates, or market impact.
- Local volatility is parametric, not calibrated through Dupire inversion.
- Stochastic volatility uses Euler full-truncation simulation, not production
  Heston calibration or Fourier pricing.
- Hedging experiments are deterministic examples unless extended to many paths.
- The pybind11 module source is included; building it requires a local pybind11
  CMake package and a compatible compiler toolchain.
