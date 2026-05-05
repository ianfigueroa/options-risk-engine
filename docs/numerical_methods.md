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

## Interpolation

The C++ and Python `VolSurface` classes use bilinear interpolation over strike and expiry. The surface requires a complete rectangular grid around the query point.

## Randomness

Monte Carlo and hedging simulation use deterministic seeds for reproducible runs. Hedging paths can include Bernoulli jump arrivals with lognormal jump sizes. The hedging layer also exposes a path-distribution helper that runs many seeded paths and returns aggregated mean / std / quantile / cost statistics.

## Advanced Volatility Simulation

Local-vol and stochastic-vol prices are estimated with seeded Monte Carlo. The
local-vol model evaluates volatility at each path step from current spot and
elapsed time. The stochastic-vol model evolves correlated spot and variance
shocks with full truncation:

```text
v_used = max(v, 0)
v_next = max(0, v + kappa(theta-v_used)dt + eta sqrt(v_used) sqrt(dt) Z_v)
```

These are research-grade simulation tools, not calibrated production volatility
model infrastructure.
