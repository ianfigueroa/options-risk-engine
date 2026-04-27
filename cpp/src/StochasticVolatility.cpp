#include "options/StochasticVolatility.hpp"

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

void validate_params(const HestonParams& params) {
    if (params.initial_variance < 0.0 || params.long_run_variance < 0.0) {
        throw std::invalid_argument("variance parameters cannot be negative");
    }
    if (params.mean_reversion < 0.0 || params.vol_of_vol < 0.0) {
        throw std::invalid_argument("heston speed and vol of vol cannot be negative");
    }
    if (params.correlation < -1.0 || params.correlation > 1.0) {
        throw std::invalid_argument("heston correlation must be within [-1, 1]");
    }
}

void evolve_pair(
    double& spot,
    double& variance,
    const MarketData& market,
    const HestonParams& params,
    const double dt,
    const double z_spot,
    const double z_variance) {
    const double variance_floor = std::max(variance, 0.0);
    const double sigma = std::sqrt(variance_floor);
    spot *= std::exp(
        (market.rate - market.dividend_yield - 0.5 * variance_floor) * dt
        + sigma * std::sqrt(dt) * z_spot);
    variance = std::max(0.0,
        variance
        + params.mean_reversion * (params.long_run_variance - variance_floor) * dt
        + params.vol_of_vol * sigma * std::sqrt(dt) * z_variance);
}

}  // namespace

double stochastic_vol_monte_carlo_price(
    const OptionContract& contract,
    const MarketData& market,
    const HestonParams& params,
    const PathConfig& config) {
    validate_contract(contract);
    validate_market(market);
    validate_params(params);
    validate_path_config(config);

    std::mt19937_64 rng{config.seed};
    std::normal_distribution<double> normal{0.0, 1.0};
    const double dt = contract.time_to_expiry / static_cast<double>(config.steps);
    const double independent_scale = std::sqrt(1.0 - params.correlation * params.correlation);
    double payoff_sum{0.0};
    std::size_t samples{0};

    for (std::size_t path = 0; path < config.paths; ++path) {
        double spot = market.spot;
        double variance = params.initial_variance;
        double anti_spot = market.spot;
        double anti_variance = params.initial_variance;

        for (std::size_t step = 0; step < config.steps; ++step) {
            const double z1 = normal(rng);
            const double z2 = normal(rng);
            const double z_variance = params.correlation * z1 + independent_scale * z2;
            evolve_pair(spot, variance, market, params, dt, z1, z_variance);

            if (config.antithetic) {
                evolve_pair(
                    anti_spot,
                    anti_variance,
                    market,
                    params,
                    dt,
                    -z1,
                    -z_variance);
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

