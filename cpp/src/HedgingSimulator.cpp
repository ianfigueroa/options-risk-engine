#include "options/HedgingSimulator.hpp"

#include "options/BlackScholes.hpp"
#include "options/Greeks.hpp"

#include <algorithm>
#include <cmath>
#include <random>
#include <stdexcept>

namespace options {
namespace {

void validate_config(const HedgingConfig& config) {
    if (config.steps == 0 || config.rebalance_interval == 0) {
        throw std::invalid_argument("hedging steps and rebalance interval must be positive");
    }
    if (config.rebalance_interval > config.steps) {
        throw std::invalid_argument("rebalance interval cannot exceed steps");
    }
    if (config.assumed_volatility <= 0.0 || config.realized_volatility < 0.0) {
        throw std::invalid_argument("hedging volatilities are invalid");
    }
    if (config.transaction_cost_rate < 0.0) {
        throw std::invalid_argument("transaction cost rate cannot be negative");
    }
    if (config.jump_intensity < 0.0 || config.jump_stddev < 0.0) {
        throw std::invalid_argument("jump intensity and standard deviation cannot be negative");
    }
}

double hedge_delta(
    OptionContract contract,
    MarketData market,
    const double spot,
    const double time_to_expiry,
    const double assumed_volatility) {
    if (time_to_expiry == 0.0) {
        return 0.0;
    }
    contract.time_to_expiry = time_to_expiry;
    market.spot = spot;
    market.volatility = assumed_volatility;
    return black_scholes_greeks(contract, market).delta;
}

}  // namespace

HedgingResult simulate_delta_hedge(
    const OptionContract& contract,
    const MarketData& market,
    const HedgingConfig& config) {
    validate_contract(contract);
    validate_market(market);
    validate_config(config);

    MarketData pricing_market = market;
    pricing_market.volatility = config.assumed_volatility;
    const double premium = black_scholes_price(contract, pricing_market);
    const double dt = contract.time_to_expiry / static_cast<double>(config.steps);

    std::mt19937_64 rng{config.seed};
    std::normal_distribution<double> normal{0.0, 1.0};
    std::bernoulli_distribution jump_occurs{
        std::min(1.0, config.jump_intensity * dt)
    };

    HedgingResult result{};
    result.option_premium = premium;
    result.spot_path.reserve(config.steps + 1);
    result.delta_path.reserve(config.steps + 1);

    double spot = market.spot;
    double delta = hedge_delta(
        contract,
        market,
        spot,
        contract.time_to_expiry,
        config.assumed_volatility);
    double initial_cost = std::fabs(delta) * spot * config.transaction_cost_rate;
    double cash = premium - delta * spot - initial_cost;
    result.transaction_costs += initial_cost;
    result.spot_path.push_back(spot);
    result.delta_path.push_back(delta);

    for (std::size_t step = 1; step <= config.steps; ++step) {
        cash *= std::exp(market.rate * dt);

        const double z = normal(rng);
        const double drift =
            (market.rate - market.dividend_yield
             - 0.5 * config.realized_volatility * config.realized_volatility) * dt;
        const double diffusion = config.realized_volatility * std::sqrt(dt) * z;
        spot *= std::exp(drift + diffusion);

        if (config.jump_intensity > 0.0 && jump_occurs(rng)) {
            const double jump_z = normal(rng);
            spot *= std::exp(
                config.jump_mean - 0.5 * config.jump_stddev * config.jump_stddev
                + config.jump_stddev * jump_z);
        }

        const double remaining_time =
            std::max(0.0, contract.time_to_expiry - static_cast<double>(step) * dt);
        if (remaining_time > 0.0 && step % config.rebalance_interval == 0) {
            const double next_delta = hedge_delta(
                contract,
                market,
                spot,
                remaining_time,
                config.assumed_volatility);
            const double trade = next_delta - delta;
            const double cost = std::fabs(trade) * spot * config.transaction_cost_rate;
            cash -= trade * spot + cost;
            result.transaction_costs += cost;
            delta = next_delta;
        }

        result.spot_path.push_back(spot);
        result.delta_path.push_back(delta);
    }

    const double payoff = intrinsic_value(contract, spot);
    const double hedge_value = cash + delta * spot;
    result.terminal_spot = spot;
    result.hedging_error = hedge_value - payoff;
    return result;
}

}  // namespace options

