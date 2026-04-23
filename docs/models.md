# Models

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

## Binomial Tree

The CRR tree supports European and American exercise:

```text
u = exp(sigma sqrt(dt)), d = 1/u
p = [exp((r-q)dt) - d] / (u-d)
```

American options are valued by maxing continuation value against intrinsic value during backward induction.

## Monte Carlo

The European Monte Carlo pricer samples exact GBM terminal spots and discounts average payoff. Antithetic variates reduce variance.

## Future Work

Local volatility and stochastic volatility are documented placeholders. A production extension would calibrate Dupire local vol or Heston/SABR dynamics and add no-static-arbitrage surface calibration.

