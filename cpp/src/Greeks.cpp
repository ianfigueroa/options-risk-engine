#include "options/Greeks.hpp"

#include "options/BlackScholes.hpp"

#include <cmath>

namespace options {
namespace {

struct DValues {
    double d1{0.0};
    double d2{0.0};
};

DValues d_values(const OptionContract& contract, const MarketData& market) {
    const double sqrt_time = std::sqrt(contract.time_to_expiry);
    const double variance = market.volatility * market.volatility;
    const double d1 = (std::log(market.spot / contract.strike)
                       + (market.rate - market.dividend_yield + 0.5 * variance)
                           * contract.time_to_expiry)
        / (market.volatility * sqrt_time);
    return DValues{d1, d1 - market.volatility * sqrt_time};
}

}  // namespace

Greeks black_scholes_greeks(const OptionContract& contract, const MarketData& market) {
    validate_contract(contract);
    validate_market(market);

    if (contract.time_to_expiry == 0.0 || market.volatility == 0.0) {
        return Greeks{};
    }

    const auto values = d_values(contract, market);
    const double sqrt_time = std::sqrt(contract.time_to_expiry);
    const double spot_discount = std::exp(-market.dividend_yield * contract.time_to_expiry);
    const double strike_discount = std::exp(-market.rate * contract.time_to_expiry);
    const double common_gamma =
        spot_discount * normal_pdf(values.d1) / (market.spot * market.volatility * sqrt_time);
    const double common_vega = market.spot * spot_discount * normal_pdf(values.d1) * sqrt_time;

    Greeks greeks{};
    greeks.gamma = common_gamma;
    greeks.vega = common_vega;

    if (contract.type == OptionType::call) {
        greeks.delta = spot_discount * normal_cdf(values.d1);
        greeks.theta =
            -market.spot * spot_discount * normal_pdf(values.d1) * market.volatility
                / (2.0 * sqrt_time)
            - market.rate * contract.strike * strike_discount * normal_cdf(values.d2)
            + market.dividend_yield * market.spot * spot_discount * normal_cdf(values.d1);
        greeks.rho =
            contract.strike * contract.time_to_expiry * strike_discount * normal_cdf(values.d2);
        return greeks;
    }

    greeks.delta = spot_discount * (normal_cdf(values.d1) - 1.0);
    greeks.theta =
        -market.spot * spot_discount * normal_pdf(values.d1) * market.volatility
            / (2.0 * sqrt_time)
        + market.rate * contract.strike * strike_discount * normal_cdf(-values.d2)
        - market.dividend_yield * market.spot * spot_discount * normal_cdf(-values.d1);
    greeks.rho =
        -contract.strike * contract.time_to_expiry * strike_discount * normal_cdf(-values.d2);
    return greeks;
}

}  // namespace options

