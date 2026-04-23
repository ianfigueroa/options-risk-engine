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

