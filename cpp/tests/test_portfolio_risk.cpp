#include "options/BlackScholes.hpp"
#include "options/Greeks.hpp"
#include "options/Portfolio.hpp"
#include "options/RiskEngine.hpp"

#include <cmath>
#include <iostream>
#include <string>
#include <vector>

namespace {

int failures{0};

void expect_near(
    const std::string& name,
    const double actual,
    const double expected,
    const double tolerance) {
    if (std::fabs(actual - expected) > tolerance) {
        std::cerr << name << " expected " << expected << " got " << actual << '\n';
        ++failures;
    }
}

void expect_true(const std::string& name, const bool condition) {
    if (!condition) {
        std::cerr << name << " failed\n";
        ++failures;
    }
}

options::MarketData market() {
    return options::MarketData{100.0, 0.04, 0.01, 0.22};
}

options::OptionContract option(const options::OptionType type, const double strike) {
    return options::OptionContract{
        type,
        options::ExerciseType::european,
        strike,
        0.5
    };
}

options::Portfolio sample_portfolio() {
    options::Portfolio portfolio{};
    portfolio.add_position(options::Position{option(options::OptionType::call, 100.0), 10.0});
    portfolio.add_position(options::Position{option(options::OptionType::put, 95.0), -4.0});
    portfolio.set_underlying_units(25.0);
    portfolio.set_cash(-500.0);
    return portfolio;
}

void test_portfolio_market_value() {
    const auto md = market();
    const auto portfolio = sample_portfolio();
    const double expected =
        10.0 * options::black_scholes_price(option(options::OptionType::call, 100.0), md)
        - 4.0 * options::black_scholes_price(option(options::OptionType::put, 95.0), md)
        + 25.0 * md.spot
        - 500.0;

    expect_near("portfolio value", portfolio.market_value(md), expected, 1.0e-10);
}

void test_portfolio_greeks() {
    const auto md = market();
    const auto portfolio = sample_portfolio();
    const auto call_greeks =
        options::black_scholes_greeks(option(options::OptionType::call, 100.0), md);
    const auto put_greeks =
        options::black_scholes_greeks(option(options::OptionType::put, 95.0), md);

    const auto aggregate = portfolio.aggregate_greeks(md);

    expect_near("portfolio delta", aggregate.delta,
        10.0 * call_greeks.delta - 4.0 * put_greeks.delta + 25.0, 1.0e-10);
    expect_near("portfolio gamma", aggregate.gamma,
        10.0 * call_greeks.gamma - 4.0 * put_greeks.gamma, 1.0e-10);
    expect_near("portfolio vega", aggregate.vega,
        10.0 * call_greeks.vega - 4.0 * put_greeks.vega, 1.0e-10);
}

void test_scenario_repricing() {
    const auto md = market();
    const auto portfolio = sample_portfolio();
    const options::Scenario scenario{"spot up five", 0.05, 0.0, 0.0, 0.0};
    const auto result = options::reprice_scenario(portfolio, md, scenario);

    expect_near("scenario pnl", result.pnl,
        result.scenario_value - result.base_value, 1.0e-10);
    expect_true("positive spot pnl", result.pnl > 0.0);
}

void test_standard_stress_suite() {
    const auto results = options::standard_stress_tests(sample_portfolio(), market());
    bool found_crash{false};
    bool found_vol_up{false};

    for (const auto& result : results) {
        found_crash = found_crash || result.label == "combined crash";
        found_vol_up = found_vol_up || result.label == "vol up 5 points";
    }

    expect_true("has crash", found_crash);
    expect_true("has vol up", found_vol_up);
    expect_true("stress scenarios populated", results.size() >= 10);
}

void test_scenario_greeks_matrix() {
    const auto md = market();
    const auto portfolio = sample_portfolio();
    const std::vector<options::Scenario> scenarios{
        {"base", 0.0, 0.0, 0.0, 0.0},
        {"spot up", 0.05, 0.0, 0.0, 0.0},
        {"vol up", 0.0, 0.05, 0.0, 0.0}
    };

    const auto rows = options::scenario_greeks(portfolio, md, scenarios);

    expect_true("scenario greeks count", rows.size() == scenarios.size());
    expect_true("base label preserved", rows.front().label == "base");
    expect_near("base scenario delta",
        rows.front().greeks.delta,
        portfolio.aggregate_greeks(md).delta,
        1.0e-10);
    expect_true("spot scenario changes delta",
        std::fabs(rows[1].greeks.delta - rows.front().greeks.delta) > 1.0e-8);
    expect_true("vol scenario changes vega",
        std::fabs(rows[2].greeks.vega - rows.front().greeks.vega) > 1.0e-8);
}

}  // namespace

int main() {
    test_portfolio_market_value();
    test_portfolio_greeks();
    test_scenario_repricing();
    test_standard_stress_suite();
    test_scenario_greeks_matrix();

    if (failures == 0) {
        std::cout << "portfolio risk tests passed\n";
        return 0;
    }

    std::cerr << failures << " portfolio risk tests failed\n";
    return 1;
}
