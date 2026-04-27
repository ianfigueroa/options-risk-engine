#ifndef OPTIONS_STOCHASTIC_VOLATILITY_HPP
#define OPTIONS_STOCHASTIC_VOLATILITY_HPP

#include "options/Types.hpp"

namespace options {

struct HestonParams {
    double initial_variance{0.04};
    double long_run_variance{0.04};
    double mean_reversion{2.0};
    double vol_of_vol{0.30};
    double correlation{-0.50};
};

double stochastic_vol_monte_carlo_price(
    const OptionContract& contract,
    const MarketData& market,
    const HestonParams& params,
    const PathConfig& config = {});

}  // namespace options

#endif  // OPTIONS_STOCHASTIC_VOLATILITY_HPP

