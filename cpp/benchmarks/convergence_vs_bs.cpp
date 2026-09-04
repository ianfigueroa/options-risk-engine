// Numerical convergence check: binomial tree and Monte-Carlo pricers vs the
// closed-form Black-Scholes price, across 100+ European contracts.
//
// Doubles as a correctness test: it exits non-zero if any pricer drifts past its
// tolerance, so it can run under CTest as well as by hand.
//
// Tolerances reflect what the pricers actually deliver (measured at HEAD):
//   - Binomial (2000 steps):   max relative error < 0.25%   (typ. ~0.07%)
//   - Monte-Carlo (1M paths):  avg relative error < 0.25%   (typ. ~0.09%)
//                              max relative error < 0.50%   (tail on far-OTM
//                              contracts is Monte-Carlo sampling noise, not bias)
//
#include "options/BlackScholes.hpp"
#include "options/BinomialTree.hpp"
#include "options/MonteCarlo.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>

using namespace options;

int main() {
    const MarketData market{100.0, 0.04, 0.01, 0.22};
    const std::size_t binomial_steps = 2000;
    MonteCarloConfig mc;
    mc.paths = 1'000'000;
    mc.antithetic = true;
    mc.seed = 7;

    // Ignore near-worthless options: relative error is meaningless when BS ~ 0.
    const double price_floor = 0.50;

    int priced = 0;
    double bin_max = 0.0, bin_sum = 0.0;
    double mc_max = 0.0, mc_sum = 0.0;

    for (int i = 0; i < 120; ++i) {
        OptionContract c;
        c.type = (i % 2 == 0) ? OptionType::call : OptionType::put;
        c.exercise = ExerciseType::european;
        c.strike = 75.0 + static_cast<double>(i % 80);
        c.time_to_expiry = 0.10 + static_cast<double>(i % 24) / 12.0;

        const double bs = black_scholes_price(c, market);
        if (bs < price_floor) continue;
        ++priced;

        const double bin = binomial_tree_price(c, market, binomial_steps);
        const double bin_err = std::fabs(bin - bs) / bs * 100.0;
        bin_max = std::max(bin_max, bin_err);
        bin_sum += bin_err;

        const double mcp = monte_carlo_price(c, market, mc);
        const double mc_err = std::fabs(mcp - bs) / bs * 100.0;
        mc_max = std::max(mc_max, mc_err);
        mc_sum += mc_err;
    }

    const double bin_avg = bin_sum / priced;
    const double mc_avg = mc_sum / priced;

    std::printf("contracts priced: %d (BS >= %.2f)\n", priced, price_floor);
    std::printf("Binomial(%zu steps)  vs BS:  max=%.4f%%  avg=%.4f%%\n",
                binomial_steps, bin_max, bin_avg);
    std::printf("MonteCarlo(%zu paths) vs BS:  max=%.4f%%  avg=%.4f%%\n",
                mc.paths, mc_max, mc_avg);

    // Thresholds - see header comment.
    const double kBinMaxTol = 0.25;  // %
    const double kMcAvgTol = 0.25;   // %
    const double kMcMaxTol = 0.50;   // %

    bool ok = true;
    if (bin_max >= kBinMaxTol) {
        std::printf("FAIL: binomial max error %.4f%% >= %.2f%%\n", bin_max, kBinMaxTol);
        ok = false;
    }
    if (mc_avg >= kMcAvgTol) {
        std::printf("FAIL: Monte-Carlo avg error %.4f%% >= %.2f%%\n", mc_avg, kMcAvgTol);
        ok = false;
    }
    if (mc_max >= kMcMaxTol) {
        std::printf("FAIL: Monte-Carlo max error %.4f%% >= %.2f%%\n", mc_max, kMcMaxTol);
        ok = false;
    }

    std::printf("%s\n", ok ? "PASS" : "FAILED");
    return ok ? 0 : 1;
}
