#ifndef OPTIONS_RISK_ENGINE_HPP
#define OPTIONS_RISK_ENGINE_HPP

#include "options/Portfolio.hpp"

#include <string>
#include <vector>

namespace options {

struct Scenario {
    std::string label{};
    double spot_shock{0.0};
    double vol_shock{0.0};
    double rate_shock{0.0};
    double time_decay{0.0};
};

struct ScenarioResult {
    std::string label{};
    double base_value{0.0};
    double scenario_value{0.0};
    double pnl{0.0};
};

ScenarioResult reprice_scenario(
    const Portfolio& portfolio,
    const MarketData& market,
    const Scenario& scenario);

std::vector<ScenarioResult> standard_stress_tests(
    const Portfolio& portfolio,
    const MarketData& market);

}  // namespace options

#endif  // OPTIONS_RISK_ENGINE_HPP

