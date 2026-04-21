#include "options/HedgingSimulator.hpp"

#include <cmath>
#include <exception>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {

int failures{0};

void expect_true(const std::string& name, const bool condition) {
    if (!condition) {
        std::cerr << name << " failed\n";
        ++failures;
    }
}

template <typename Fn>
void expect_throws(const std::string& name, Fn&& fn) {
    try {
        fn();
        std::cerr << name << " expected exception\n";
        ++failures;
    } catch (const std::invalid_argument&) {
    } catch (const std::exception& error) {
        std::cerr << name << " wrong exception: " << error.what() << '\n';
        ++failures;
    }
}

options::MarketData market() {
    return options::MarketData{100.0, 0.02, 0.0, 0.20};
}

options::OptionContract call() {
    return options::OptionContract{
        options::OptionType::call,
        options::ExerciseType::european,
        100.0,
        1.0
    };
}

options::HedgingConfig config() {
    return options::HedgingConfig{
        52,
        1,
        7,
        0.20,
        0.20,
        0.0,
        0.0,
        0.0,
        0.0
    };
}

void test_simulation_path_shape() {
    const auto result = options::simulate_delta_hedge(call(), market(), config());

    expect_true("spot path size", result.spot_path.size() == 53);
    expect_true("delta path populated", result.delta_path.size() == 53);
    expect_true("finite hedging error", std::isfinite(result.hedging_error));
    expect_true("terminal spot positive", result.terminal_spot > 0.0);
}

void test_transaction_costs_increase_cost_metric() {
    auto low_cost = config();
    auto high_cost = config();
    high_cost.transaction_cost_rate = 0.01;

    const auto low = options::simulate_delta_hedge(call(), market(), low_cost);
    const auto high = options::simulate_delta_hedge(call(), market(), high_cost);

    expect_true("higher costs recorded", high.transaction_costs > low.transaction_costs);
}

void test_volatility_misspecification_changes_error() {
    auto correct = config();
    auto underestimated = config();
    underestimated.assumed_volatility = 0.12;

    const auto correct_result = options::simulate_delta_hedge(call(), market(), correct);
    const auto wrong_result = options::simulate_delta_hedge(call(), market(), underestimated);

    expect_true("misspecification changes error",
        std::fabs(correct_result.hedging_error - wrong_result.hedging_error) > 1.0e-8);
}

void test_jump_process_changes_path() {
    auto jumpy = config();
    jumpy.jump_intensity = 5.0;
    jumpy.jump_stddev = 0.10;

    const auto gbm = options::simulate_delta_hedge(call(), market(), config());
    const auto jump = options::simulate_delta_hedge(call(), market(), jumpy);

    expect_true("jump path differs", std::fabs(gbm.terminal_spot - jump.terminal_spot) > 1.0e-8);
}

void test_invalid_hedging_inputs() {
    auto bad = config();
    bad.steps = 0;
    expect_throws("zero steps", [&] { options::simulate_delta_hedge(call(), market(), bad); });

    bad = config();
    bad.rebalance_interval = 0;
    expect_throws("zero rebalance", [&] { options::simulate_delta_hedge(call(), market(), bad); });

    bad = config();
    bad.transaction_cost_rate = -0.01;
    expect_throws("negative costs", [&] { options::simulate_delta_hedge(call(), market(), bad); });
}

}  // namespace

int main() {
    test_simulation_path_shape();
    test_transaction_costs_increase_cost_metric();
    test_volatility_misspecification_changes_error();
    test_jump_process_changes_path();
    test_invalid_hedging_inputs();

    if (failures == 0) {
        std::cout << "hedging simulator tests passed\n";
        return 0;
    }

    std::cerr << failures << " hedging simulator tests failed\n";
    return 1;
}

