#include "options/BlackScholes.hpp"
#include "options/Greeks.hpp"

#include <cmath>
#include <exception>
#include <iostream>
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

options::OptionContract contract(const options::OptionType type) {
    return options::OptionContract{
        type,
        options::ExerciseType::european,
        102.0,
        0.75
    };
}

options::MarketData market() {
    return options::MarketData{
        100.0,
        0.04,
        0.01,
        0.25
    };
}

double price_with_spot(
    const options::OptionContract& option,
    options::MarketData market_data,
    const double spot) {
    market_data.spot = spot;
    return options::black_scholes_price(option, market_data);
}

double price_with_vol(
    const options::OptionContract& option,
    options::MarketData market_data,
    const double volatility) {
    market_data.volatility = volatility;
    return options::black_scholes_price(option, market_data);
}

double price_with_rate(
    const options::OptionContract& option,
    options::MarketData market_data,
    const double rate) {
    market_data.rate = rate;
    return options::black_scholes_price(option, market_data);
}

double price_with_time(
    options::OptionContract option,
    const options::MarketData& market_data,
    const double time_to_expiry) {
    option.time_to_expiry = time_to_expiry;
    return options::black_scholes_price(option, market_data);
}

void test_greeks_against_finite_differences(const options::OptionType type) {
    const auto option = contract(type);
    const auto md = market();
    const auto greeks = options::black_scholes_greeks(option, md);

    constexpr double spot_step{0.01};
    const double price_up = price_with_spot(option, md, md.spot + spot_step);
    const double price_down = price_with_spot(option, md, md.spot - spot_step);
    const double price_base = options::black_scholes_price(option, md);
    const double fd_delta = (price_up - price_down) / (2.0 * spot_step);
    const double fd_gamma = (price_up - 2.0 * price_base + price_down)
        / (spot_step * spot_step);

    constexpr double vol_step{0.0001};
    const double fd_vega =
        (price_with_vol(option, md, md.volatility + vol_step)
         - price_with_vol(option, md, md.volatility - vol_step))
        / (2.0 * vol_step);

    constexpr double rate_step{0.0001};
    const double fd_rho =
        (price_with_rate(option, md, md.rate + rate_step)
         - price_with_rate(option, md, md.rate - rate_step))
        / (2.0 * rate_step);

    constexpr double time_step{1.0 / 365.0};
    const double fd_theta =
        -(price_with_time(option, md, option.time_to_expiry + time_step)
          - price_with_time(option, md, option.time_to_expiry - time_step))
        / (2.0 * time_step);

    expect_near("delta", greeks.delta, fd_delta, 1.0e-5);
    expect_near("gamma", greeks.gamma, fd_gamma, 1.0e-4);
    expect_near("vega", greeks.vega, fd_vega, 1.0e-5);
    expect_near("rho", greeks.rho, fd_rho, 1.0e-5);
    expect_near("theta", greeks.theta, fd_theta, 1.0e-4);
}

void test_greek_signs() {
    const auto md = market();
    const auto call_greeks = options::black_scholes_greeks(contract(options::OptionType::call), md);
    const auto put_greeks = options::black_scholes_greeks(contract(options::OptionType::put), md);

    expect_true("call delta positive", call_greeks.delta > 0.0);
    expect_true("put delta negative", put_greeks.delta < 0.0);
    expect_true("gamma positive", call_greeks.gamma > 0.0 && put_greeks.gamma > 0.0);
    expect_true("vega positive", call_greeks.vega > 0.0 && put_greeks.vega > 0.0);
    expect_true("call rho positive", call_greeks.rho > 0.0);
    expect_true("put rho negative", put_greeks.rho < 0.0);
}

}  // namespace

int main() {
    test_greeks_against_finite_differences(options::OptionType::call);
    test_greeks_against_finite_differences(options::OptionType::put);
    test_greek_signs();

    if (failures == 0) {
        std::cout << "greeks tests passed\n";
        return 0;
    }

    std::cerr << failures << " greeks tests failed\n";
    return 1;
}

