#include "options/BlackScholes.hpp"

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

options::OptionContract atm_call() {
    return options::OptionContract{
        options::OptionType::call,
        options::ExerciseType::european,
        100.0,
        1.0
    };
}

options::MarketData market() {
    return options::MarketData{
        100.0,
        0.05,
        0.0,
        0.20
    };
}

void test_known_prices() {
    const auto md = market();
    const auto call = atm_call();
    const auto put = options::OptionContract{
        options::OptionType::put,
        options::ExerciseType::european,
        100.0,
        1.0
    };

    expect_near("atm call price", options::black_scholes_price(call, md), 10.4506, 1.0e-4);
    expect_near("atm put price", options::black_scholes_price(put, md), 5.5735, 1.0e-4);
}

void test_put_call_parity() {
    const auto md = market();
    const auto call = atm_call();
    const auto put = options::OptionContract{
        options::OptionType::put,
        options::ExerciseType::european,
        100.0,
        1.0
    };

    const double lhs =
        options::black_scholes_price(call, md) - options::black_scholes_price(put, md);
    const double rhs =
        md.spot * std::exp(-md.dividend_yield * call.time_to_expiry)
        - call.strike * std::exp(-md.rate * call.time_to_expiry);

    expect_near("put call parity", lhs, rhs, 1.0e-10);
}

void test_intrinsic_at_expiry() {
    const auto expired_call = options::OptionContract{
        options::OptionType::call,
        options::ExerciseType::european,
        95.0,
        0.0
    };
    const auto expired_put = options::OptionContract{
        options::OptionType::put,
        options::ExerciseType::european,
        105.0,
        0.0
    };
    const auto md = market();

    expect_near("expired call intrinsic", options::black_scholes_price(expired_call, md), 5.0, 0.0);
    expect_near("expired put intrinsic", options::black_scholes_price(expired_put, md), 5.0, 0.0);
}

void test_invalid_inputs() {
    auto md = market();
    auto contract = atm_call();

    md.spot = -1.0;
    expect_throws("negative spot", [&] { options::black_scholes_price(contract, md); });

    md = market();
    md.volatility = -0.1;
    expect_throws("negative vol", [&] { options::black_scholes_price(contract, md); });

    md = market();
    contract.strike = 0.0;
    expect_throws("zero strike", [&] { options::black_scholes_price(contract, md); });
}

}  // namespace

int main() {
    test_known_prices();
    test_put_call_parity();
    test_intrinsic_at_expiry();
    test_invalid_inputs();

    if (failures == 0) {
        std::cout << "black scholes tests passed\n";
        return 0;
    }

    std::cerr << failures << " black scholes tests failed\n";
    return 1;
}

