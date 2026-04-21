#ifndef OPTIONS_IMPLIED_VOL_HPP
#define OPTIONS_IMPLIED_VOL_HPP

#include "options/Types.hpp"

namespace options {

struct PriceBounds {
    double lower{0.0};
    double upper{0.0};
};

PriceBounds no_arbitrage_bounds(const OptionContract& contract, const MarketData& market);

double implied_volatility(
    const OptionContract& contract,
    const MarketData& market,
    double option_price,
    double initial_guess = 0.2,
    double tolerance = 1.0e-10,
    int max_iterations = 100);

}  // namespace options

#endif  // OPTIONS_IMPLIED_VOL_HPP

