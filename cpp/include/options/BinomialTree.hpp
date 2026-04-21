#ifndef OPTIONS_BINOMIAL_TREE_HPP
#define OPTIONS_BINOMIAL_TREE_HPP

#include "options/Types.hpp"

#include <cstddef>

namespace options {

double binomial_tree_price(
    const OptionContract& contract,
    const MarketData& market,
    std::size_t steps);

}  // namespace options

#endif  // OPTIONS_BINOMIAL_TREE_HPP

