#ifndef OPTIONS_BLACK_SCHOLES_HPP
#define OPTIONS_BLACK_SCHOLES_HPP

#include "options/Types.hpp"

namespace options {

double normal_pdf(double x) noexcept;
double normal_cdf(double x) noexcept;
double black_scholes_price(const OptionContract& contract, const MarketData& market);
double forward_price(const OptionContract& contract, const MarketData& market);

}  // namespace options

#endif  // OPTIONS_BLACK_SCHOLES_HPP

