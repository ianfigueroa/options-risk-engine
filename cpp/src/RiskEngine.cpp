#include "options/RiskEngine.hpp"

#include "options/BlackScholes.hpp"
#include "options/Greeks.hpp"

#include <algorithm>
#include <stdexcept>

namespace options {
namespace {

MarketData shocked_market(const MarketData& market, const Scenario& scenario) {
    MarketData shocked = market;
    shocked.spot = market.spot * (1.0 + scenario.spot_shock);
    shocked.volatility = std::max(0.0, market.volatility + scenario.vol_shock);
    shocked.rate = market.rate + scenario.rate_shock;
    validate_market(shocked);
    return shocked;
}

OptionContract decayed_contract(OptionContract contract, const Scenario& scenario) {
    if (scenario.time_decay < 0.0) {
        throw std::invalid_argument("time decay cannot be negative");
    }
    contract.time_to_expiry = std::max(0.0, contract.time_to_expiry - scenario.time_decay);
    return contract;
}

double scenario_value(
    const Portfolio& portfolio,
    const MarketData& market,
    const Scenario& scenario) {
    const auto shocked = shocked_market(market, scenario);

    double value = portfolio.underlying_units() * shocked.spot + portfolio.cash();
    for (const auto& position : portfolio.positions()) {
        value += position.quantity
            * black_scholes_price(decayed_contract(position.contract, scenario), shocked);
    }
    return value;
}

Greeks aggregate_scenario_greeks(
    const Portfolio& portfolio,
    const MarketData& market,
    const Scenario& scenario) {
    const auto shocked = shocked_market(market, scenario);
    Greeks aggregate{};
    aggregate.delta = portfolio.underlying_units();

    for (const auto& position : portfolio.positions()) {
        const auto contract = decayed_contract(position.contract, scenario);
        const auto greeks = black_scholes_greeks(contract, shocked);
        aggregate.delta += position.quantity * greeks.delta;
        aggregate.gamma += position.quantity * greeks.gamma;
        aggregate.vega += position.quantity * greeks.vega;
        aggregate.theta += position.quantity * greeks.theta;
        aggregate.rho += position.quantity * greeks.rho;
    }
    return aggregate;
}

}  // namespace

ScenarioResult reprice_scenario(
    const Portfolio& portfolio,
    const MarketData& market,
    const Scenario& scenario) {
    const double base = portfolio.market_value(market);
    const double shocked = scenario_value(portfolio, market, scenario);
    return ScenarioResult{
        scenario.label,
        base,
        shocked,
        shocked - base
    };
}

std::vector<ScenarioResult> standard_stress_tests(
    const Portfolio& portfolio,
    const MarketData& market) {
    const std::vector<Scenario> scenarios{
        {"spot down 1%", -0.01, 0.0, 0.0, 0.0},
        {"spot up 1%", 0.01, 0.0, 0.0, 0.0},
        {"spot down 5%", -0.05, 0.0, 0.0, 0.0},
        {"spot up 5%", 0.05, 0.0, 0.0, 0.0},
        {"spot down 10%", -0.10, 0.0, 0.0, 0.0},
        {"spot up 10%", 0.10, 0.0, 0.0, 0.0},
        {"vol down 5 points", 0.0, -0.05, 0.0, 0.0},
        {"vol up 5 points", 0.0, 0.05, 0.0, 0.0},
        {"rate up 100 bp", 0.0, 0.0, 0.01, 0.0},
        {"one week decay", 0.0, 0.0, 0.0, 7.0 / 365.0},
        {"combined crash", -0.10, 0.10, -0.005, 7.0 / 365.0}
    };

    std::vector<ScenarioResult> results{};
    results.reserve(scenarios.size());
    for (const auto& scenario : scenarios) {
        results.push_back(reprice_scenario(portfolio, market, scenario));
    }
    return results;
}

std::vector<ScenarioGreeksResult> scenario_greeks(
    const Portfolio& portfolio,
    const MarketData& market,
    const std::vector<Scenario>& scenarios) {
    std::vector<ScenarioGreeksResult> rows{};
    rows.reserve(scenarios.size());
    for (const auto& scenario : scenarios) {
        rows.push_back(ScenarioGreeksResult{
            scenario.label,
            aggregate_scenario_greeks(portfolio, market, scenario)
        });
    }
    return rows;
}

}  // namespace options
