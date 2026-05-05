# Options Risk Engine — How It Works

A walkthrough of what this project is, how the pieces fit together, and the math
behind every model. It is meant for someone reading the repo cold who wants to
understand the system before changing it, not just run the demo.

If you only want to start the app, the top-level `README.md` covers that.

---

## 1. What problem the project solves

Options pricing and risk management split into a few related questions:

1. Given a market and an option, what is it worth?
2. How does that value move when spot, vol, rates, or time change?
3. Given a *price*, what volatility does the market imply?
4. Given a *book* of positions, what is the aggregate exposure and how much can it
   lose in a stress scenario?
5. If we hedge it dynamically, how well does replication actually work in
   practice?

Each of those questions has a clean theoretical answer that breaks down in
different ways under real markets (jumps, transaction costs, smile dynamics,
discrete rebalancing). The point of this repo is to make the clean answers
*and* the failure modes explorable side-by-side.

---

## 2. Architecture at a glance

```
                ┌──────────────┐
                │  Frontend    │   React + TypeScript dashboard
                │  (Vite)      │   talks to the API only
                └──────┬───────┘
                       │ HTTP/JSON
                ┌──────▼───────┐
                │  FastAPI     │   pricing, greeks, IV, surface,
                │  service     │   portfolio, hedging endpoints
                └──────┬───────┘
                       │ Python calls
                ┌──────▼───────┐
                │ options_lab  │   Python analytics layer
                │ (Python pkg) │   — pure-Python by default
                └──────┬───────┘   — falls back to native via pybind11
                       │
                ┌──────▼───────┐
                │   cpp/       │   C++20 numerical core
                │  (CMake)     │   pricing, greeks, IV, MC, trees, surface
                └──────────────┘
```

The frontend never talks to the C++ core directly. The Python layer is the
single point where the analytics live; the C++ extension is an optional
performance accelerator that exposes the same API surface. That means the
project still runs as a learning artifact even on machines without a working
C++ toolchain.

### Why two implementations?

- **Python**: readable, debuggable, easy to extend, good enough for a
  laptop demo. Also serves as the spec — if a C++ pricer disagrees with the
  Python pricer, the Python version is the reference.
- **C++**: ~10–50x faster on Monte Carlo and tree pricers, which matters once
  you start sweeping a vol surface or running thousands of hedge paths.

---

## 3. Math, model by model

### 3.1 Black-Scholes (closed form, European)

Underlying spot $S_t$ follows geometric Brownian motion under the risk-neutral
measure:

$$dS_t = (r - q)\, S_t\, dt + \sigma\, S_t\, dW_t$$

where $r$ is the risk-free rate, $q$ the continuous dividend yield, and
$\sigma$ the constant volatility. The European call/put prices are:

$$C = S\, e^{-qT}\, N(d_1) \;-\; K\, e^{-rT}\, N(d_2)$$
$$P = K\, e^{-rT}\, N(-d_2) \;-\; S\, e^{-qT}\, N(-d_1)$$
$$d_1 = \frac{\ln(S/K) + (r - q + \tfrac12 \sigma^2)\,T}{\sigma\sqrt{T}},\quad d_2 = d_1 - \sigma\sqrt{T}$$

`N` is the standard normal CDF.

**Sanity checks the code relies on:**

- *Put-call parity* — $C - P = S\,e^{-qT} - K\,e^{-rT}$ holds to
  floating-point tolerance for arbitrary inputs.
- *Boundary behaviour* — call $\to (S - K\,e^{-rT})^+$ as $\sigma \to 0$ for
  ITM, and $\to 0$ for OTM.
- *Intrinsic vs. time value* — the dashboard separates these because for an
  ATM option the price is essentially time value, and getting a sign wrong on
  $d_1$ collapses time value to a wrong number that still passes shape checks.

**Limitations:** constant $\sigma$, no smile, no discrete dividends, no jumps.
Everything that follows in this project is here to push past one of those.

---

### 3.2 Greeks (analytic)

The first- and second-order sensitivities of the BS formula. The codebase
computes them analytically (no bumping) so they stay numerically clean near
zero:

| Greek | Definition | Closed form (call) |
|-------|-----------|--------------------|
| Delta | $\partial V/\partial S$ | $e^{-qT} N(d_1)$ |
| Gamma | $\partial^2 V/\partial S^2$ | $\frac{e^{-qT}\, N'(d_1)}{S\,\sigma\sqrt{T}}$ |
| Vega  | $\partial V/\partial \sigma$ | $S\, e^{-qT}\, N'(d_1)\, \sqrt{T}$ |
| Theta | $\partial V/\partial t$ | $-\frac{S\, e^{-qT}\, N'(d_1)\, \sigma}{2\sqrt{T}} - r K e^{-rT} N(d_2) + q S e^{-qT} N(d_1)$ |
| Rho   | $\partial V/\partial r$ | $K\, T\, e^{-rT}\, N(d_2)$ |

Vega and Gamma are reported per *unit* underlying / per *unit* vol, not per
point — the dashboard rescales for display.

---

### 3.3 Implied volatility solver

Given a market price $V^{\mathrm{mkt}}$, find $\sigma^*$ such that
$BS(\sigma^*) = V^{\mathrm{mkt}}$. The pricer is monotone in $\sigma$, so
this is a 1-D root-finding problem. The solver uses:

1. **No-arbitrage gate** — reject any market price outside
   $[\max(0, S e^{-qT} - K e^{-rT}),\ S e^{-qT}]$ for calls (and the parity-
   equivalent bounds for puts). This avoids spending Newton steps on
   impossible inputs.
2. **Newton-Raphson** with vega as the derivative — converges quadratically
   when vega is large.
3. **Bisection fallback** — when vega goes flat (deep ITM/OTM, or near
   expiry), Newton jumps wildly, so the solver clamps to a $[10^{-6}, 5.0]$
   bracket and falls back to bisection.

The hybrid is what makes the routine survive on real chains where many
strikes have tiny vega.

---

### 3.4 Binomial tree (CRR)

Used for American options where early exercise matters.

$$u = e^{\sigma\sqrt{\Delta t}},\quad d = 1/u,\quad p = \frac{e^{(r-q)\Delta t} - d}{u - d}$$

Backward induction from the terminal payoff:

$$V_{i,j} = \max\big(\text{intrinsic}_{i,j},\; e^{-r\Delta t}\,(p\, V_{i+1,j+1} + (1-p)\, V_{i+1,j})\big)$$

The `max` against intrinsic is what makes it American; remove it and you
recover a European binomial pricer that converges to Black-Scholes as
$N \to \infty$.

---

### 3.5 Monte Carlo (European)

Direct simulation of terminal spots under GBM:

$$S_T = S_0\, \exp\!\Big(\big(r - q - \tfrac12 \sigma^2\big)T + \sigma\sqrt{T}\,Z\Big),\quad Z \sim \mathcal{N}(0,1)$$

Price = $e^{-rT}\,\mathbb{E}[\text{payoff}(S_T)]$, estimated by sample mean.

**Variance reduction** — antithetic variates: for every $Z$ also use $-Z$.
Cuts variance roughly in half on payoffs that are monotone in $Z$, which
includes vanilla calls/puts.

---

### 3.6 Local volatility (parametric, illustrative)

Instead of a calibrated Dupire surface, the local-vol pricer uses a simple
state-dependent vol:

$$\sigma_{\text{loc}}(S, t) = \mathrm{clamp}\big(\sigma_0 + \beta_S\,(S/S_0 - 1) + \beta_t\, t,\ \sigma_{\min},\ \sigma_{\max}\big)$$

It is simulated with an Euler step. This is *not* a Dupire local vol; it
exists to demonstrate how smile-aware pricing produces a different surface
shape from constant-vol Monte Carlo.

---

### 3.7 Stochastic volatility (Heston)

Two-factor SDE:

$$dS_t = (r - q) S_t\, dt + \sqrt{v_t}\, S_t\, dW_1$$
$$dv_t = \kappa(\theta - v_t)\, dt + \eta\sqrt{v_t}\, dW_2$$
$$\mathrm{corr}(dW_1, dW_2) = \rho$$

Simulated with **Euler full-truncation**: at each step, replace $v_t$ with
$\max(v_t, 0)$ before taking the square root. This is the simplest scheme
that doesn't blow up when the Feller condition $2\kappa\theta > \eta^2$ is
violated. A production system would use the Quadratic Exponential (QE) scheme
of Andersen.

---

### 3.8 Volatility surface

Inputs: a list of `(strike, expiry, implied_vol)` quotes from market or
synthesized.

Interpolation is **bilinear in (strike, expiry)** — easy to reason about, and
sufficient for the dashboard's heatmap. Out-of-bounds queries clamp to the
grid edge.

**Quote sanity:**

- $\sigma > 0$
- bid $\le$ ask
- IV not absurdly far from neighbouring strikes
- *Calendar arbitrage* — total variance $w(k,T) = \sigma(k,T)^2 \cdot T$ should
  be monotone non-decreasing in $T$ for each strike. Violations are flagged.
- *Butterfly arbitrage* (coarse heuristic) — for any three adjacent strikes
  on a slice, the middle IV should not sit substantially below the linear
  interpolation of its wings. This is a proxy for negative implied density;
  a calibrated SVI fit would express the same constraint analytically.

A production extension would calibrate SVI per slice, enforce no-arbitrage
constraints exactly, and re-fit for each new snapshot.

---

### 3.9 Portfolio risk

A position is `(contract, quantity)`. Portfolio value is linear in positions:

$$V_\Pi = \sum_i q_i\, V_i + N_S\, S + \text{cash}$$

Greeks aggregate the same way (linearity of differentiation), so portfolio
delta is the quantity-weighted sum of position deltas, and similarly for the
others.

**Stress / scenario engine** — rather than a Taylor expansion (which the
dashboard *also* shows for didactic reasons), the engine reprices every
position under a shocked market: shifted spot, shifted vol surface, time
decay applied. That captures gamma and cross-effects exactly, at the cost of
doing $\#\text{positions} \times \#\text{scenarios}$ pricer calls.

The **scenario Greek matrix** does the same trick at the *Greek* level: how
does delta itself change after a 5% spot shock? This is what risk teams
usually look at in practice — not just "what's the PnL of a shock", but "what
is the exposure profile *after* the shock".

---

### 3.10 Delta hedging simulator

A short-call delta-hedging experiment. Per step:

1. Reprice the option, compute delta.
2. Adjust the underlying hedge to match the new delta.
3. Charge transaction cost on traded notional.
4. Roll cash account at the risk-free rate.
5. Step spot forward via GBM (optionally with compound-Poisson jumps).

At expiry, replication PnL = (hedge account terminal) − (option terminal
payoff). Under continuous rebalancing, no jumps, no costs, and correct $\sigma$,
this should be zero (Black-Scholes replication theorem). The simulator lets
you measure the four ways replication breaks:

- Wrong $\sigma$ — biased delta, persistent error.
- Discrete rebalancing — gamma-PnL leakage, scales with $\sqrt{\Delta t}$.
- Transaction costs — turnover-linked drag.
- Jumps — uncovered exposure, fat-tailed error distribution.

A `simulate_delta_hedge_paths` helper aggregates many seeded paths and
returns the distribution of replication error (mean, std, p05/p50/p95,
worst/best) plus average transaction costs. That is what you actually want
when assessing a hedging program — a single seeded path is anecdote, the
distribution is data.

---

## 4. Data flow at runtime

A single dashboard request traces:

```
React form (strike, expiry, market data)
        │
        ▼
POST /price                         api/main.py
        │
        ▼
PricingService                      api/main.py
        │
        ▼
options_lab.analytics.pricing       Python wrapper
        │
   (if ext available)
        ▼
options_lab.bindings (pybind11)     Python ↔ C++ glue
        │
        ▼
cpp/src/BlackScholes.cpp            actual numerics
```

If the C++ extension fails to import (no compiler, mismatched ABI), the
Python wrapper transparently falls back to its own implementation, so the
project still runs end-to-end without a working toolchain.

---

## 5. Live data path

Live snapshot and option-chain data come from Yahoo Finance via `yfinance`.
The market-data layer (`api/market_data.py`) wraps that with:

- **Per-key TTL caches** — snapshot 60s, option quote 120s, option chain 300s.
- **Request pacing** — minimum 2.5s between Yahoo requests to stay polite.
- **Stale-clear** — when a different ticker is selected, the previous quote
  cache is cleared so the dashboard never shows mixed-symbol data.

This is for exploration only. For anything serious, swap the adapter for a
proper market-data subscription.

---

## 6. Things that would make this a real system

- Calibrate SVI / SABR / Heston to listed chains and *cache the parameters*.
- Replace the parametric local vol with a proper Dupire fit.
- Move the surface to log-strike + total-variance space and enforce static
  arbitrage explicitly.
- Drive the hedging simulator from a block-bootstrap of historical returns
  rather than GBM, to preserve the empirical jump and clustering structure.
- Replace Yahoo with a real market-data adapter (Polygon / Tradier / IBKR).
- Streaming surface updates (WebSocket from API → frontend) instead of polled
  REST.
- Persistent storage for historical surfaces and risk reports.

These are flagged in the "Future work" sections of `docs/models.md` and
`docs/numerical_methods.md` as well.
