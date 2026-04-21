#ifndef OPTIONS_GREEKS_HPP
#define OPTIONS_GREEKS_HPP

#include "options/Types.hpp"

namespace options {

Greeks black_scholes_greeks(const OptionContract& contract, const MarketData& market);

}  // namespace options

#endif  // OPTIONS_GREEKS_HPP

