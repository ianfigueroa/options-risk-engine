#include "options/BinomialTree.hpp"
#include "options/BlackScholes.hpp"
#include "options/MonteCarlo.hpp"

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
    return options::MarketData{100.0, 0.05, 0.0, 0.20};
}

options::OptionContract european(const options::OptionType type) {
    return options::OptionContract{
        type,
        options::ExerciseType::european,
        100.0,
        1.0
    };
}

void test_binomial_converges_to_black_scholes() {
    const auto option = european(options::OptionType::call);
    const auto md = market();
    const double tree_price = options::binomial_tree_price(option, md, 500);
    const double bs_price = options::black_scholes_price(option, md);

    expect_near("binomial call convergence", tree_price, bs_price, 0.02);
}

void test_american_put_not_below_european_put() {
    const auto md = market();
    const auto european_put = european(options::OptionType::put);
    const auto american_put = options::OptionContract{
        options::OptionType::put,
        options::ExerciseType::american,
        100.0,
        1.0
    };

    const double european_price = options::binomial_tree_price(european_put, md, 300);
    const double american_price = options::binomial_tree_price(american_put, md, 300);

    expect_true("american put premium", american_price >= european_price);
}

void test_monte_carlo_converges_approximately() {
    const auto option = european(options::OptionType::call);
    const auto md = market();
    const options::MonteCarloConfig config{80000, 42, true};

    const double mc_price = options::monte_carlo_price(option, md, config);
    const double bs_price = options::black_scholes_price(option, md);

    expect_near("monte carlo call convergence", mc_price, bs_price, 0.12);
}

void test_invalid_numerical_inputs() {
    const auto option = european(options::OptionType::call);
    const auto md = market();

    expect_throws("zero tree steps", [&] {
        options::binomial_tree_price(option, md, 0);
    });
    expect_throws("zero mc paths", [&] {
        options::monte_carlo_price(option, md, options::MonteCarloConfig{0, 1, false});
    });
}

}  // namespace

int main() {
    test_binomial_converges_to_black_scholes();
    test_american_put_not_below_european_put();
    test_monte_carlo_converges_approximately();
    test_invalid_numerical_inputs();

    if (failures == 0) {
        std::cout << "numerical model tests passed\n";
        return 0;
    }

    std::cerr << failures << " numerical model tests failed\n";
    return 1;
}

