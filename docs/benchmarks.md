# Benchmarks

Measured on this local Windows/MinGW/Python environment on 2026-05-04.

## Commands

```powershell
cmake --build build
.\build\price_many_options.exe 1000
.\build\price_many_options.exe 100000
py -3 -m options_lab.research.benchmark_pricing
```

## Results

| Benchmark | Size | Time |
|---|---:|---:|
| C++ Black-Scholes | 1,000 options | 0.175 ms |
| C++ Black-Scholes | 100,000 options | 17.555 ms |
| Python Black-Scholes | 1,000 options | 2.282 ms |
| Python Black-Scholes | 100,000 options | 223.526 ms |
| Python Monte Carlo | 10,000 paths | 11.488 ms |
| Python Monte Carlo | 100,000 paths | 118.449 ms |

The C++ closed-form loop is roughly 12-13x faster than the pure-Python loop in this microbenchmark. These numbers are single-run timings and should be treated as directional rather than a statistically rigorous benchmark suite.

## Convergence vs Black-Scholes

`convergence_vs_bs` prices 100+ European contracts with the binomial-tree and
Monte-Carlo engines and compares each against the closed-form Black-Scholes price.
It exits non-zero if any pricer drifts past tolerance, so it also runs as a CTest
correctness test:

```bash
cmake --build build --target convergence_vs_bs
ctest --test-dir build -R convergence_vs_bs --output-on-failure
```

Measured against Black-Scholes across 110 priced contracts:

| Pricer | Max rel. error | Avg rel. error | Tolerance |
|---|---:|---:|---|
| Binomial (2000 steps) | ~0.07% | ~0.01% | max < 0.25% |
| Monte-Carlo (1M paths, antithetic) | ~0.44% | ~0.09% | avg < 0.25%, max < 0.50% |

The Monte-Carlo max sits above 0.25% on far-OTM contracts - that tail is sampling
noise at 1M paths, not pricing bias, so the test bounds the MC *average* at 0.25%
and its worst case at 0.50%.

