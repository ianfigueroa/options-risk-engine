#include "options/VolSurface.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace options {
namespace {

void append_unique(std::vector<double>& values, const double value) {
    values.push_back(value);
    std::sort(values.begin(), values.end());
    values.erase(std::unique(values.begin(), values.end()), values.end());
}

std::pair<double, double> bracket(const std::vector<double>& values, const double target) {
    if (target < values.front() || target > values.back()) {
        throw std::invalid_argument("interpolation point is outside surface domain");
    }

    const auto upper = std::lower_bound(values.begin(), values.end(), target);
    if (upper == values.end()) {
        return {values.back(), values.back()};
    }
    if (*upper == target || upper == values.begin()) {
        return {*upper, *upper};
    }
    return {*(upper - 1), *upper};
}

double linear_weight(const double low, const double high, const double value) {
    if (low == high) {
        return 0.0;
    }
    return (value - low) / (high - low);
}

double blend(const double low, const double high, const double weight) {
    return low + weight * (high - low);
}

}  // namespace

VolSurface::VolSurface(std::vector<VolQuote> quotes)
    : quotes_(std::move(quotes)) {
    if (quotes_.empty()) {
        throw std::invalid_argument("vol surface requires at least one quote");
    }

    for (const auto& quote : quotes_) {
        if (!std::isfinite(quote.strike) || quote.strike <= 0.0) {
            throw std::invalid_argument("quote strike must be positive");
        }
        if (!std::isfinite(quote.expiry) || quote.expiry <= 0.0) {
            throw std::invalid_argument("quote expiry must be positive");
        }
        append_unique(strikes_, quote.strike);
        append_unique(expiries_, quote.expiry);
    }
}

double VolSurface::quote_vol(const double strike, const double expiry) const {
    for (const auto& quote : quotes_) {
        if (quote.strike == strike && quote.expiry == expiry) {
            return quote.implied_vol;
        }
    }
    throw OptionsError("vol surface grid is missing an interpolation corner");
}

double VolSurface::interpolate(const double strike, const double expiry) const {
    const auto [low_strike, high_strike] = bracket(strikes_, strike);
    const auto [low_expiry, high_expiry] = bracket(expiries_, expiry);

    const double v00 = quote_vol(low_strike, low_expiry);
    const double v10 = quote_vol(high_strike, low_expiry);
    const double v01 = quote_vol(low_strike, high_expiry);
    const double v11 = quote_vol(high_strike, high_expiry);

    const double strike_weight = linear_weight(low_strike, high_strike, strike);
    const double expiry_weight = linear_weight(low_expiry, high_expiry, expiry);
    const double low_expiry_vol = blend(v00, v10, strike_weight);
    const double high_expiry_vol = blend(v01, v11, strike_weight);
    return blend(low_expiry_vol, high_expiry_vol, expiry_weight);
}

std::vector<SuspiciousQuote> VolSurface::detect_suspicious_quotes(
    const double max_absolute_spread) const {
    if (max_absolute_spread < 0.0) {
        throw std::invalid_argument("max spread must be non-negative");
    }

    std::vector<SuspiciousQuote> warnings{};
    for (std::size_t index = 0; index < quotes_.size(); ++index) {
        const auto& quote = quotes_[index];
        if (!std::isfinite(quote.implied_vol) || quote.implied_vol <= 0.0) {
            warnings.push_back({index, "non-positive implied volatility"});
        }
        if (quote.bid < 0.0 || quote.ask < 0.0 || quote.bid > quote.ask) {
            warnings.push_back({index, "invalid bid ask quote"});
        } else if (quote.ask - quote.bid > max_absolute_spread) {
            warnings.push_back({index, "wide bid ask spread"});
        }
    }
    return warnings;
}

std::vector<std::string> VolSurface::arbitrage_warnings() const {
    std::vector<std::string> warnings{};
    for (const double strike : strikes_) {
        double previous_total_variance{-1.0};
        for (const double expiry : expiries_) {
            const double vol = quote_vol(strike, expiry);
            if (vol <= 0.0) {
                continue;
            }
            const double total_variance = vol * vol * expiry;
            if (previous_total_variance > total_variance + 1.0e-12) {
                warnings.push_back("calendar total variance decreases for strike "
                    + std::to_string(strike));
            }
            previous_total_variance = total_variance;
        }
    }
    return warnings;
}

const std::vector<VolQuote>& VolSurface::quotes() const noexcept {
    return quotes_;
}

}  // namespace options

