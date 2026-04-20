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

## Model Scope

The initial production core focuses on equity-style European options under
Black-Scholes assumptions, CRR binomial trees, Monte Carlo under GBM, and
portfolio risk by repricing. Local volatility and stochastic volatility are
documented as future extensions rather than implied by the current code.

