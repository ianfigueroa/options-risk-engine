# Numerical Methods

## Implied Volatility

The IV solver first validates European no-arbitrage bounds:

```text
Call lower = max(S e^{-qT} - K e^{-rT}, 0), upper = S e^{-qT}
Put lower = max(K e^{-rT} - S e^{-qT}, 0), upper = K e^{-rT}
```

It then runs Newton-Raphson using analytical vega. If vega is too small or the Newton step leaves the volatility bracket, the solver switches to bisection on `[1e-8, 5.0]`.

## Greeks

Analytical Greeks are computed for Black-Scholes. Vega and rho are per unit volatility/rate. Theta is calendar theta, equivalent to `-dV/dT`.

Finite-difference C++ tests compare delta, gamma, vega, theta, and rho against central differences.

## Interpolation

The C++ and Python `VolSurface` classes use bilinear interpolation over strike and expiry. The surface requires a complete rectangular grid around the query point.

## Randomness

Monte Carlo and hedging simulation use deterministic seeds for repeatable tests. Hedging paths can include Bernoulli jump arrivals with lognormal jump sizes.

