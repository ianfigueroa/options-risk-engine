#ifndef OPTIONS_LOCAL_VOLATILITY_HPP
#define OPTIONS_LOCAL_VOLATILITY_HPP

#include "options/Types.hpp"

namespace options {

struct LocalVolModel {
    double base_volatility{0.20};
    double spot_slope{0.0};
    double time_slope{0.0};
    double min_volatility{0.01};
    double max_volatility{2.0};
};

double local_volatility(
    const LocalVolModel& model,
    double spot,
    double reference_spot,
    double elapsed_time);

double local_vol_monte_carlo_price(
    const OptionContract& contract,
    const MarketData& market,
    const LocalVolModel& model,
    const PathConfig& config = {});

}  // namespace options

#endif  // OPTIONS_LOCAL_VOLATILITY_HPP

