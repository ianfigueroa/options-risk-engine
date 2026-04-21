#include "options/MonteCarlo.hpp"

#include <cmath>
#include <random>
#include <stdexcept>

namespace options {
namespace {

double payoff(const OptionContract& contract, const double terminal_spot) {
    return intrinsic_value(contract, terminal_spot);
}

double terminal_spot(const MarketData& market, const double time, const double z) {
    const double drift =
        (market.rate - market.dividend_yield - 0.5 * market.volatility * market.volatility) * time;
    const double diffusion = market.volatility * std::sqrt(time) * z;
    return market.spot * std::exp(drift + diffusion);
}

}  // namespace

double monte_carlo_price(
    const OptionContract& contract,
    const MarketData& market,
    const MonteCarloConfig& config) {
    validate_contract(contract);
    validate_market(market);

    if (config.paths == 0) {
        throw std::invalid_argument("monte carlo paths must be positive");
    }
    if (contract.time_to_expiry == 0.0) {
        return intrinsic_value(contract, market.spot);
    }

    std::mt19937_64 rng{config.seed};
    std::normal_distribution<double> normal{0.0, 1.0};
    double payoff_sum{0.0};
    std::size_t samples{0};

    for (std::size_t path = 0; path < config.paths; ++path) {
        const double z = normal(rng);
        const double spot = terminal_spot(market, contract.time_to_expiry, z);
        payoff_sum += payoff(contract, spot);
        ++samples;

        if (config.antithetic) {
            const double anti_spot = terminal_spot(market, contract.time_to_expiry, -z);
            payoff_sum += payoff(contract, anti_spot);
            ++samples;
        }
    }

    const double discounted_average =
        std::exp(-market.rate * contract.time_to_expiry) * payoff_sum
        / static_cast<double>(samples);
    return discounted_average;
}

}  // namespace options

