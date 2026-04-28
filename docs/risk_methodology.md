# Risk Methodology

## Portfolio Risk

Portfolio value is full revaluation:

```text
V = cash + underlying_units * S + sum(quantity_i * option_value_i)
```

Aggregate Greeks are quantity-weighted option Greeks plus underlying delta.

Scenario Greeks revalue those same Greeks under shocked spot, volatility, rate,
and time-to-expiry assumptions. This is separate from stress PnL and helps
explain whether a shock makes the portfolio more convex, more vega-exposed, or
more rate-sensitive.

## Stress Testing

Standard scenarios include:

- Spot up/down 1%, 5%, and 10%.
- Volatility up/down 5 vol points.
- Rate up 100 bp.
- One week of time decay.
- Combined crash: spot down 10%, vol up 10 points, rate down 50 bp, one week decay.

PnL is computed by full repricing, not by linear Greek approximation.

## Delta Hedging

The simulator sells one option, receives premium, buys Black-Scholes delta shares, and finances the hedge with cash. Cash accrues at the risk-free rate. Rebalancing trades pay proportional transaction costs.

Hedging error at expiry is:

```text
cash_T + delta_T * S_T - option_payoff_T
```

Discrete rebalancing, transaction costs, volatility misspecification, and jumps are expected to increase dispersion of hedging error.
