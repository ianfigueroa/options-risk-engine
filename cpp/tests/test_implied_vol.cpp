#include "options/BlackScholes.hpp"
#include "options/ImpliedVol.hpp"

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

template <typename Fn>
void expect_throws(const std::string& name, Fn&& fn) {
    try {
        fn();
        std::cerr << name << " expected exception\n";
        ++failures;
    } catch (const std::invalid_argument&) {
    } catch (const options::OptionsError&) {
    } catch (const std::exception& error) {
        std::cerr << name << " wrong exception: " << error.what() << '\n';
        ++failures;
    }
}

options::MarketData base_market(const double volatility) {
    return options::MarketData{100.0, 0.03, 0.01, volatility};
}

options::OptionContract option(const options::OptionType type, const double strike) {
    return options::OptionContract{
        type,
        options::ExerciseType::european,
        strike,
        0.8
    };
}

void test_solver_recovers_input_volatility() {
    for (const auto type : {options::OptionType::call, options::OptionType::put}) {
        for (const double strike : {80.0, 100.0, 120.0}) {
            const auto contract = option(type, strike);
            const auto market = base_market(0.31);
            const double price = options::black_scholes_price(contract, market);

            const double solved =
                options::implied_volatility(contract, market, price, 0.18);

            expect_near("recovered iv", solved, market.volatility, 1.0e-8);
        }
    }
}

void test_solver_handles_newton_fallback_case() {
    const auto contract = option(options::OptionType::call, 160.0);
    const auto market = base_market(0.45);
    const double price = options::black_scholes_price(contract, market);

    const double solved = options::implied_volatility(contract, market, price, 0.05);

    expect_near("fallback iv", solved, 0.45, 1.0e-7);
}

void test_no_arbitrage_bounds() {
    const auto contract = option(options::OptionType::call, 100.0);
    const auto market = base_market(0.25);
    const auto bounds = options::no_arbitrage_bounds(contract, market);

    expect_throws("below lower bound", [&] {
        options::implied_volatility(contract, market, bounds.lower - 0.01);
    });
    expect_throws("above upper bound", [&] {
        options::implied_volatility(contract, market, bounds.upper + 0.01);
    });
}

void test_bad_numeric_inputs() {
    auto contract = option(options::OptionType::put, 100.0);
    auto market = base_market(0.25);

    expect_throws("negative option price", [&] {
        options::implied_volatility(contract, market, -1.0);
    });

    market.spot = 0.0;
    expect_throws("bad market", [&] {
        options::implied_volatility(contract, market, 2.0);
    });
}

}  // namespace

int main() {
    test_solver_recovers_input_volatility();
    test_solver_handles_newton_fallback_case();
    test_no_arbitrage_bounds();
    test_bad_numeric_inputs();

    if (failures == 0) {
        std::cout << "implied volatility tests passed\n";
        return 0;
    }

    std::cerr << failures << " implied volatility tests failed\n";
    return 1;
}

