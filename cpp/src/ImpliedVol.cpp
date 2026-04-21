#include "options/ImpliedVol.hpp"

#include "options/BlackScholes.hpp"
#include "options/Greeks.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace options {
namespace {

constexpr double min_volatility{1.0e-8};
constexpr double max_volatility{5.0};

bool within_bounds(const double value, const PriceBounds& bounds, const double tolerance) {
    return value + tolerance >= bounds.lower && value - tolerance <= bounds.upper;
}

double price_at_vol(const OptionContract& contract, MarketData market, const double volatility) {
    market.volatility = volatility;
    return black_scholes_price(contract, market);
}

}  // namespace

PriceBounds no_arbitrage_bounds(const OptionContract& contract, const MarketData& market) {
    validate_contract(contract);
    validate_market(market);

    const double spot_discount =
        market.spot * std::exp(-market.dividend_yield * contract.time_to_expiry);
    const double strike_discount =
        contract.strike * std::exp(-market.rate * contract.time_to_expiry);

    if (contract.type == OptionType::call) {
        return PriceBounds{
            std::max(spot_discount - strike_discount, 0.0),
            spot_discount
        };
    }

    return PriceBounds{
        std::max(strike_discount - spot_discount, 0.0),
        strike_discount
    };
}

double implied_volatility(
    const OptionContract& contract,
    const MarketData& market,
    const double option_price,
    const double initial_guess,
    const double tolerance,
    const int max_iterations) {
    validate_contract(contract);
    validate_market(market);

    if (!std::isfinite(option_price) || option_price < 0.0) {
        throw std::invalid_argument("option price must be finite and non-negative");
    }
    if (tolerance <= 0.0 || max_iterations <= 0) {
        throw std::invalid_argument("solver tolerance and iterations must be positive");
    }

    const auto bounds = no_arbitrage_bounds(contract, market);
    if (!within_bounds(option_price, bounds, 1.0e-10)) {
        throw std::invalid_argument("option price violates European no-arbitrage bounds");
    }
    if (contract.time_to_expiry == 0.0) {
        throw OptionsError("implied volatility is undefined at expiry");
    }

    double low = min_volatility;
    double high = max_volatility;
    double sigma = std::clamp(initial_guess, low, high);

    for (int iteration = 0; iteration < max_iterations; ++iteration) {
        const double model_price = price_at_vol(contract, market, sigma);
        const double error = model_price - option_price;
        if (std::fabs(error) < tolerance) {
            return sigma;
        }

        if (error > 0.0) {
            high = sigma;
        } else {
            low = sigma;
        }

        MarketData vega_market = market;
        vega_market.volatility = sigma;
        const double vega = black_scholes_greeks(contract, vega_market).vega;
        const double newton = sigma - error / vega;

        if (vega <= std::numeric_limits<double>::epsilon()
            || !std::isfinite(newton)
            || newton <= low
            || newton >= high) {
            sigma = 0.5 * (low + high);
        } else {
            sigma = newton;
        }
    }

    for (int iteration = 0; iteration < max_iterations; ++iteration) {
        sigma = 0.5 * (low + high);
        const double model_price = price_at_vol(contract, market, sigma);
        const double error = model_price - option_price;
        if (std::fabs(error) < tolerance || (high - low) < tolerance) {
            return sigma;
        }
        if (error > 0.0) {
            high = sigma;
        } else {
            low = sigma;
        }
    }

    throw OptionsError("implied volatility solver did not converge");
}

}  // namespace options

