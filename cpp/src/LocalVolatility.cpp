#include "options/LocalVolatility.hpp"

#include <algorithm>
#include <cmath>
#include <random>
#include <stdexcept>

namespace options {
namespace {

void validate_path_config(const PathConfig& config) {
    if (config.paths == 0 || config.steps == 0) {
        throw std::invalid_argument("path count and steps must be positive");
    }
}

void validate_model(const LocalVolModel& model) {
    if (model.base_volatility <= 0.0 || model.min_volatility <= 0.0) {
        throw std::invalid_argument("local volatility levels must be positive");
    }
    if (model.max_volatility < model.min_volatility) {
        throw std::invalid_argument("local volatility cap must exceed floor");
    }
}

double evolve(
    const double spot,
    const double rate,
    const double dividend_yield,
    const double volatility,
    const double dt,
    const double z) {
    const double drift = (rate - dividend_yield - 0.5 * volatility * volatility) * dt;
    return spot * std::exp(drift + volatility * std::sqrt(dt) * z);
}

}  // namespace

double local_volatility(
    const LocalVolModel& model,
    const double spot,
    const double reference_spot,
    const double elapsed_time) {
    validate_model(model);
    if (spot <= 0.0 || reference_spot <= 0.0 || elapsed_time < 0.0) {
        throw std::invalid_argument("invalid local volatility state");
    }

    const double moneyness = spot / reference_spot - 1.0;
    const double raw = model.base_volatility
        + model.spot_slope * moneyness
        + model.time_slope * elapsed_time;
    return std::clamp(raw, model.min_volatility, model.max_volatility);
}

double local_vol_monte_carlo_price(
    const OptionContract& contract,
    const MarketData& market,
    const LocalVolModel& model,
    const PathConfig& config) {
    validate_contract(contract);
    validate_market(market);
    validate_model(model);
    validate_path_config(config);

    std::mt19937_64 rng{config.seed};
    std::normal_distribution<double> normal{0.0, 1.0};
    const double dt = contract.time_to_expiry / static_cast<double>(config.steps);
    double payoff_sum{0.0};
    std::size_t samples{0};

    for (std::size_t path = 0; path < config.paths; ++path) {
        double spot = market.spot;
        double anti_spot = market.spot;
        for (std::size_t step = 0; step < config.steps; ++step) {
            const double elapsed = static_cast<double>(step) * dt;
            const double z = normal(rng);
            const double vol = local_volatility(model, spot, market.spot, elapsed);
            spot = evolve(spot, market.rate, market.dividend_yield, vol, dt, z);

            if (config.antithetic) {
                const double anti_vol =
                    local_volatility(model, anti_spot, market.spot, elapsed);
                anti_spot = evolve(
                    anti_spot, market.rate, market.dividend_yield, anti_vol, dt, -z);
            }
        }
        payoff_sum += intrinsic_value(contract, spot);
        ++samples;
        if (config.antithetic) {
            payoff_sum += intrinsic_value(contract, anti_spot);
            ++samples;
        }
    }

    return std::exp(-market.rate * contract.time_to_expiry)
        * payoff_sum / static_cast<double>(samples);
}

}  // namespace options

