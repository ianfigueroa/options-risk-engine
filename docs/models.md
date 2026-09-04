# Models and Numerical Methods

## Black-Scholes

European option valuation assumes geometric Brownian motion:

```text
dS_t = (r - q) S_t dt + sigma S_t dW_t
```

The closed-form call and put prices are:

```text
C = S e^{-qT} N(d1) - K e^{-rT} N(d2)
P = K e^{-rT} N(-d2) - S e^{-qT} N(-d1)
d1 = [ln(S/K) + (r - q + 0.5 sigma^2)T] / (sigma sqrt(T))
d2 = d1 - sigma sqrt(T)
```

Limitations: constant volatility, continuous rates/dividends, lognormal spot dynamics, no discrete dividends, no smile dynamics.

## Greeks

Greeks are computed analytically for Black-Scholes, not by bumping. For a call:

```text
Delta = e^{-qT} N(d1)
Gamma = e^{-qT} N'(d1) / (S sigma sqrt(T))
Vega  = S e^{-qT} N'(d1) sqrt(T)
Theta = -S e^{-qT} N'(d1) sigma / (2 sqrt(T)) - r K e^{-rT} N(d2) + q S e^{-qT} N(d1)
Rho   = K T e^{-rT} N(d2)
```

Vega and rho are per unit volatility/rate. Theta is calendar theta, equivalent to `-dV/dT`.

## Implied Volatility

The IV solver first validates European no-arbitrage bounds:

```text
Call lower = max(S e^{-qT} - K e^{-rT}, 0), upper = S e^{-qT}
Put lower = max(K e^{-rT} - S e^{-qT}, 0), upper = K e^{-rT}
```

It then runs Newton-Raphson using analytical vega. If vega is too small or the Newton step leaves the volatility bracket, the solver switches to bisection on `[1e-8, 5.0]`. The fallback matters on real chains, where deep ITM/OTM and short-dated strikes have almost no vega.

## Binomial Tree

The CRR tree supports European and American exercise:

```text
u = exp(sigma sqrt(dt)), d = 1/u
p = [exp((r-q)dt) - d] / (u-d)
V[i,j] = max(intrinsic[i,j], e^{-r dt} (p V[i+1,j+1] + (1-p) V[i+1,j]))
```

The `max` against intrinsic value is what makes it American. Without it the tree is a European pricer that converges to Black-Scholes as the step count grows.

## Monte Carlo

The European Monte Carlo pricer samples exact GBM terminal spots and discounts the average payoff:

```text
S_T = S_0 exp((r - q - 0.5 sigma^2)T + sigma sqrt(T) Z),  Z ~ N(0,1)
price = e^{-rT} mean(payoff(S_T))
```

Antithetic variates (using both `Z` and `-Z`) reduce variance.

## Local Volatility

The local-volatility pricer is a Monte Carlo model with a simple parametric
state-dependent volatility:

```text
sigma_local(S,t) = clamp(base + spot_slope * (S / S0 - 1) + time_slope * t)
```

Volatility is evaluated at each path step from the current spot and elapsed time.
It is useful for testing smile-sensitive path pricing, but it is not a calibrated
Dupire model.

## Stochastic Volatility

The stochastic-volatility pricer uses Heston-style variance dynamics:

```text
dS_t = (r-q) S_t dt + sqrt(v_t) S_t dW_1
dv_t = kappa(theta - v_t)dt + eta sqrt(v_t)dW_2
corr(dW_1, dW_2) = rho
```

Simulation uses Euler full truncation to keep variance non-negative:

```text
v_used = max(v, 0)
v_next = max(0, v + kappa(theta-v_used)dt + eta sqrt(v_used) sqrt(dt) Z_v)
```

Both advanced models are priced with seeded Monte Carlo and are not calibrated to market data.

## Volatility Surface

The C++ and Python `VolSurface` classes use bilinear interpolation over strike and expiry. The surface requires a complete rectangular grid around the query point; a query outside the grid is an error.

The Python surface also flags two kinds of static-arbitrage warning:

- Calendar: total variance `sigma^2 T` decreasing with expiry for a strike.
- Butterfly (coarse): the middle IV of three adjacent strikes sitting more than 5 vol points below the line between its wings. This is a proxy for negative implied density, not a calibrated test.

## Randomness

Monte Carlo and hedging simulation use deterministic seeds for reproducible runs. Hedging paths can include Bernoulli jump arrivals with lognormal jump sizes. The hedging layer also exposes a path-distribution helper that runs many seeded paths and returns aggregated mean / std / quantile / cost statistics.

## Future Work

Calibrate Dupire local vol or Heston/SABR dynamics to listed option chains and
add stronger static-arbitrage constraints.
