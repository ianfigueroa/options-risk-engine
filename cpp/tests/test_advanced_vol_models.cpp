#include "options/BlackScholes.hpp"
#include "options/LocalVolatility.hpp"
#include "options/StochasticVolatility.hpp"

#include <cmath>
#include <exception>
#include <iostream>
#include <stdexcept>
#include <string>

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
    return options::MarketData{100.0, 0.03, 0.0, 0.20};
}

options::OptionContract call() {
    return options::OptionContract{
        options::OptionType::call,
        options::ExerciseType::european,
        100.0,
        1.0
    };
}

void test_flat_local_vol_matches_black_scholes() {
    const auto md = market();
    const auto option = call();
    const options::LocalVolModel model{0.20, 0.0, 0.0, 0.01, 2.0};
    const options::PathConfig config{60000, 80, 17, true};

    const double local_price = options::local_vol_monte_carlo_price(option, md, model, config);
    const double bs_price = options::black_scholes_price(option, md);

    expect_near("flat local vol", local_price, bs_price, 0.18);
}

void test_local_vol_slope_changes_price() {
    const auto md = market();
    const auto option = call();
    const options::PathConfig config{30000, 60, 21, true};
    const double flat = options::local_vol_monte_carlo_price(
        option, md, options::LocalVolModel{0.20, 0.0, 0.0, 0.01, 2.0}, config);
    const double skewed = options::local_vol_monte_carlo_price(
        option, md, options::LocalVolModel{0.20, 0.35, 0.05, 0.01, 2.0}, config);

    expect_true("local vol price changes", std::fabs(flat - skewed) > 0.01);
}

void test_zero_vol_of_vol_matches_black_scholes() {
    const auto md = market();
    const auto option = call();
    const options::HestonParams params{0.04, 0.04, 2.0, 0.0, -0.5};
    const options::PathConfig config{60000, 80, 19, true};

    const double stochastic_price =
        options::stochastic_vol_monte_carlo_price(option, md, params, config);
    const double bs_price = options::black_scholes_price(option, md);

    expect_near("deterministic heston variance", stochastic_price, bs_price, 0.18);
}

void test_invalid_advanced_model_inputs() {
    const auto md = market();
    const auto option = call();
    expect_throws("bad local vol floor", [&] {
        options::local_vol_monte_carlo_price(
            option, md, options::LocalVolModel{0.2, 0.0, 0.0, -0.01, 2.0});
    });
    expect_throws("bad heston correlation", [&] {
        options::stochastic_vol_monte_carlo_price(
            option, md, options::HestonParams{0.04, 0.04, 1.0, 0.3, 1.5});
    });
}

}  // namespace

int main() {
    test_flat_local_vol_matches_black_scholes();
    test_local_vol_slope_changes_price();
    test_zero_vol_of_vol_matches_black_scholes();
    test_invalid_advanced_model_inputs();

    if (failures == 0) {
        std::cout << "advanced volatility model tests passed\n";
        return 0;
    }

    std::cerr << failures << " advanced volatility model tests failed\n";
    return 1;
}

