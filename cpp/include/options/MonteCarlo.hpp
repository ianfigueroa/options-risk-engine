#ifndef OPTIONS_MONTE_CARLO_HPP
#define OPTIONS_MONTE_CARLO_HPP

#include "options/Types.hpp"

#include <cstddef>
#include <cstdint>

namespace options {

struct MonteCarloConfig {
    std::size_t paths{10000};
    std::uint64_t seed{42};
    bool antithetic{true};
};

double monte_carlo_price(
    const OptionContract& contract,
    const MarketData& market,
    const MonteCarloConfig& config = {});

}  // namespace options

#endif  // OPTIONS_MONTE_CARLO_HPP

