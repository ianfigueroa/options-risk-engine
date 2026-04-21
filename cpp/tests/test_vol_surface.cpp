#include "options/VolSurface.hpp"

#include <cmath>
#include <exception>
#include <iostream>
#include <stdexcept>
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

std::vector<options::VolQuote> grid_quotes() {
    std::vector<options::VolQuote> quotes{};
    for (const double expiry : {0.5, 1.0}) {
        for (const double strike : {90.0, 100.0, 110.0}) {
            const double volatility = 0.20 + 0.001 * (strike - 100.0) + 0.02 * expiry;
            quotes.push_back(options::VolQuote{strike, expiry, volatility, 1.0, 1.1});
        }
    }
    return quotes;
}

void test_bilinear_interpolation() {
    const options::VolSurface surface{grid_quotes()};

    expect_near("interpolated vol", surface.interpolate(105.0, 0.75), 0.22, 1.0e-12);
    expect_near("exact grid vol", surface.interpolate(100.0, 1.0), 0.22, 1.0e-12);
}

void test_out_of_range_inputs() {
    const options::VolSurface surface{grid_quotes()};

    expect_throws("low strike", [&] { surface.interpolate(80.0, 0.75); });
    expect_throws("high expiry", [&] { surface.interpolate(100.0, 2.0); });
}

void test_suspicious_quote_detection() {
    auto quotes = grid_quotes();
    quotes.push_back(options::VolQuote{120.0, 1.0, -0.1, 1.0, 1.1});
    quotes.push_back(options::VolQuote{125.0, 1.0, 0.4, 1.3, 1.2});
    quotes.push_back(options::VolQuote{130.0, 1.0, 0.4, 1.0, 2.0});

    const options::VolSurface surface{quotes};
    const auto suspicious = surface.detect_suspicious_quotes(0.25);

    expect_true("negative vol flagged", suspicious.size() >= 3);
}

void test_bad_surface_inputs() {
    expect_throws("empty surface", [] {
        const options::VolSurface surface{{}};
        (void)surface;
    });
    expect_throws("negative strike", [] {
        const options::VolSurface surface{{options::VolQuote{-1.0, 1.0, 0.2, 1.0, 1.1}}};
        (void)surface;
    });
}

}  // namespace

int main() {
    test_bilinear_interpolation();
    test_out_of_range_inputs();
    test_suspicious_quote_detection();
    test_bad_surface_inputs();

    if (failures == 0) {
        std::cout << "vol surface tests passed\n";
        return 0;
    }

    std::cerr << failures << " vol surface tests failed\n";
    return 1;
}

