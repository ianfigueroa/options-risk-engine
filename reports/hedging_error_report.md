# Hedging Error Report

## Abstract

This report studies how discrete delta hedging error changes under transaction costs, volatility misspecification, jumps, and rebalance frequency. The experiments use a Black-Scholes hedge for a short European call and compare terminal hedge replication error across deterministic seeded paths.

## Introduction

Continuous-time Black-Scholes replication assumes frictionless trading and continuous rebalancing. Real hedging is discrete, pays transaction costs, and faces model error. The research question is:

> How does discrete delta hedging error change under transaction costs, volatility misspecification, jumps, and rebalance frequency?

## Model Assumptions

- Underlying follows GBM unless jump settings are enabled.
- Rates and volatility are constant during each simulation.
- The hedge uses Black-Scholes delta with the configured assumed volatility.
- The hedger is short one option, receives premium, and holds delta shares.
- Cash accrues at the risk-free rate.
- Transaction costs are proportional to traded notional.

## Pricing Methodology

The option premium is computed with Black-Scholes:

```text
C = S e^{-qT} N(d1) - K e^{-rT} N(d2)
```

The simulator can use a realized volatility different from the assumed hedge volatility. This creates model mismatch while keeping the hedge rule fixed.

## Greeks Methodology

Delta is recalculated at each rebalance date from the remaining expiry and current spot. Analytical Black-Scholes Greeks are used, with theta defined as calendar theta (`-dV/dT`).

## Hedging Simulation Setup

Base contract:

- European call.
- Spot 100.
- Strike 100.
- Expiry 1 year.
- Risk-free rate 2%.
- Realized volatility 20%.

Base hedge:

- 252 simulation steps.
- Daily rebalancing unless specified otherwise.
- Seed 11.
- Zero transaction costs unless specified otherwise.

## Experiments

The experiment runner compares:

- Correct volatility.
- Underestimated volatility.
- Overestimated volatility.
- Weekly rebalancing.
- High transaction costs.
- Jump diffusion.

## Results

| Experiment | Hedging Error | Absolute Error | Transaction Costs | Terminal Spot |
|---|---:|---:|---:|---:|
| Correct volatility | 0.0635 | 0.0635 | 0.0000 | 138.8184 |
| Underestimated volatility | -0.7888 | 0.7888 | 0.0000 | 138.8184 |
| Overestimated volatility | 1.2741 | 1.2741 | 0.0000 | 138.8184 |
| Weekly rebalancing | -0.0569 | 0.0569 | 0.0000 | 138.8184 |
| High transaction costs | -1.1270 | 1.1270 | 1.1703 | 138.8184 |
| Jump diffusion | -0.9665 | 0.9665 | 0.0000 | 101.7827 |

The single-path weekly result is not larger than daily in this seed, which is a reminder that one path is not a distributional conclusion. The more robust expectation is that less frequent rebalancing increases hedging-error variance across many paths.

## Failure Cases

- Volatility misspecification introduces systematic hedge bias.
- Transaction costs directly reduce replication PnL through trade notional.
- Jumps break continuous-diffusion replication because delta cannot hedge discontinuities.
- Low rebalance frequency can miss convexity exposure between rebalance dates.
- Near-expiry gamma can cause large delta changes from small spot moves.

## Limitations

This report uses deterministic seeded examples, not a full statistical Monte Carlo distribution. The simulator does not yet model stochastic rates, borrow costs, discrete dividends, exchange fees, market impact, or liquidity constraints. The broader project now includes local-vol and stochastic-vol pricing experiments, but the hedging simulator still uses Black-Scholes delta as the hedge rule.

## Conclusion

Discrete delta hedging is most stable when realized dynamics match the hedge model, transaction costs are low, and rebalancing is frequent. Volatility misspecification and jumps materially degrade replication.

A path-distribution helper (`simulate_delta_hedge_paths`) is now exposed on
the analytics layer, which aggregates many seeded paths into mean, std, and
p05/p50/p95 quantiles of replication error plus average transaction cost.
That turns each row of the table above from an anecdote into a distribution
without changing the underlying model. A future research extension should
also report turnover-adjusted performance and tail risk (CVaR of error)
under jump and stochastic-vol regimes.
