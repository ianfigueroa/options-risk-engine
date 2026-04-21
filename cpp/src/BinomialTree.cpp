#include "options/BinomialTree.hpp"

#include "options/BlackScholes.hpp"

#include <cmath>
#include <stdexcept>
#include <vector>

namespace options {

double binomial_tree_price(
    const OptionContract& contract,
    const MarketData& market,
    const std::size_t steps) {
    validate_contract(contract);
    validate_market(market);

    if (steps == 0) {
        throw std::invalid_argument("binomial steps must be positive");
    }
    if (contract.time_to_expiry == 0.0 || market.volatility == 0.0) {
        return black_scholes_price(contract, market);
    }

    const double dt = contract.time_to_expiry / static_cast<double>(steps);
    const double up = std::exp(market.volatility * std::sqrt(dt));
    const double down = 1.0 / up;
    const double growth = std::exp((market.rate - market.dividend_yield) * dt);
    const double probability = (growth - down) / (up - down);
    if (probability < 0.0 || probability > 1.0) {
        throw std::invalid_argument("invalid risk-neutral probability");
    }

    const double discount = std::exp(-market.rate * dt);
    std::vector<double> values(steps + 1);

    for (std::size_t node = 0; node <= steps; ++node) {
        const double spot =
            market.spot * std::pow(up, static_cast<double>(steps - node))
            * std::pow(down, static_cast<double>(node));
        values[node] = intrinsic_value(contract, spot);
    }

    for (std::size_t step = steps; step > 0; --step) {
        for (std::size_t node = 0; node < step; ++node) {
            values[node] = discount
                * (probability * values[node] + (1.0 - probability) * values[node + 1]);
            if (contract.exercise == ExerciseType::american) {
                const double spot =
                    market.spot * std::pow(up, static_cast<double>(step - 1 - node))
                    * std::pow(down, static_cast<double>(node));
                values[node] = std::max(values[node], intrinsic_value(contract, spot));
            }
        }
    }

    return values.front();
}

}  // namespace options

