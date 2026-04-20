#include "options/BlackScholes.hpp"

#include <cmath>
#include <numbers>

namespace options {
namespace {

double d1_value(const OptionContract& contract, const MarketData& market) {
    const double variance_time =
        market.volatility * market.volatility * contract.time_to_expiry;
    return (std::log(market.spot / contract.strike)
            + (market.rate - market.dividend_yield + 0.5 * market.volatility * market.volatility)
                * contract.time_to_expiry)
        / std::sqrt(variance_time);
}

double d2_value(const double d1, const OptionContract& contract, const MarketData& market) {
    return d1 - market.volatility * std::sqrt(contract.time_to_expiry);
}

}  // namespace

double normal_pdf(const double x) noexcept {
    constexpr double inverse_sqrt_two_pi{0.39894228040143267794};
    return inverse_sqrt_two_pi * std::exp(-0.5 * x * x);
}

double normal_cdf(const double x) noexcept {
    return 0.5 * std::erfc(-x / std::numbers::sqrt2);
}

double forward_price(const OptionContract& contract, const MarketData& market) {
    validate_contract(contract);
    validate_market(market);
    return market.spot * std::exp((market.rate - market.dividend_yield) * contract.time_to_expiry);
}

double black_scholes_price(const OptionContract& contract, const MarketData& market) {
    validate_contract(contract);
    validate_market(market);

    if (contract.time_to_expiry == 0.0) {
        return intrinsic_value(contract, market.spot);
    }
    if (market.volatility == 0.0) {
        const double discounted_forward =
            market.spot * std::exp(-market.dividend_yield * contract.time_to_expiry);
        const double discounted_strike =
            contract.strike * std::exp(-market.rate * contract.time_to_expiry);
        if (contract.type == OptionType::call) {
            return discounted_forward > discounted_strike
                ? discounted_forward - discounted_strike
                : 0.0;
        }
        return discounted_strike > discounted_forward
            ? discounted_strike - discounted_forward
            : 0.0;
    }

    const double d1 = d1_value(contract, market);
    const double d2 = d2_value(d1, contract, market);
    const double spot_discount =
        market.spot * std::exp(-market.dividend_yield * contract.time_to_expiry);
    const double strike_discount =
        contract.strike * std::exp(-market.rate * contract.time_to_expiry);

    if (contract.type == OptionType::call) {
        return spot_discount * normal_cdf(d1) - strike_discount * normal_cdf(d2);
    }
    return strike_discount * normal_cdf(-d2) - spot_discount * normal_cdf(-d1);
}

}  // namespace options

