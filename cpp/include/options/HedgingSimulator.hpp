#ifndef OPTIONS_HEDGING_SIMULATOR_HPP
#define OPTIONS_HEDGING_SIMULATOR_HPP

#include "options/Types.hpp"

#include <cstddef>
#include <cstdint>
#include <vector>

namespace options {

struct HedgingConfig {
    std::size_t steps{252};
    std::size_t rebalance_interval{1};
    std::uint64_t seed{42};
    double assumed_volatility{0.20};
    double realized_volatility{0.20};
    double transaction_cost_rate{0.0};
    double jump_intensity{0.0};
    double jump_mean{0.0};
    double jump_stddev{0.0};
};

struct HedgingResult {
    double option_premium{0.0};
    double terminal_spot{0.0};
    double hedging_error{0.0};
    double transaction_costs{0.0};
    std::vector<double> spot_path{};
    std::vector<double> delta_path{};
};

HedgingResult simulate_delta_hedge(
    const OptionContract& contract,
    const MarketData& market,
    const HedgingConfig& config = {});

}  // namespace options

#endif  // OPTIONS_HEDGING_SIMULATOR_HPP

