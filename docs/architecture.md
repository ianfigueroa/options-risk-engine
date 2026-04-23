# Architecture

## System Shape

The project is split into four deployable layers:

- `cpp/`: C++20 analytics core for pricing, Greeks, implied volatility, surfaces, portfolio risk, stress testing, Monte Carlo, binomial trees, and hedging simulation.
- `python/options_lab/`: Python package for notebooks, research workflows, plotting, and service integration. It can use the pybind11 extension when built and has pure-Python parity functions for portability.
- `api/`: FastAPI application with Pydantic validation for all public request bodies.
- `frontend/`: React + TypeScript dashboard for pricing, Greeks, IV, portfolio risk, stress heatmaps, vol-surface inspection, and hedging-path visualization.

## Native Core

The C++ core uses strongly typed structs (`OptionContract`, `MarketData`, `Position`, `Greeks`) and small stateless functions for deterministic pricing. Portfolio and surface objects own only value data, with no hidden global state.

Headers are public under `cpp/include/options`; implementations live in `cpp/src`. Tests are compiled by CMake and registered with CTest.

## Python/API Boundary

The Python layer exposes a stable dataclass API. The FastAPI service converts Pydantic schemas into those dataclasses and maps domain `ValueError`s into HTTP 400 responses. Malformed request bodies remain HTTP 422 validation errors.

## Dashboard Boundary

The dashboard calls `http://127.0.0.1:8000` by default. Override with `VITE_API_BASE_URL` for another API origin. Local CORS is enabled only for Vite development origins.

