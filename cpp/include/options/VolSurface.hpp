#ifndef OPTIONS_VOL_SURFACE_HPP
#define OPTIONS_VOL_SURFACE_HPP

#include "options/Types.hpp"

#include <cstddef>
#include <string>
#include <vector>

namespace options {

struct VolQuote {
    double strike{0.0};
    double expiry{0.0};
    double implied_vol{0.0};
    double bid{0.0};
    double ask{0.0};
};

struct SuspiciousQuote {
    std::size_t index{0};
    std::string reason{};
};

class VolSurface {
public:
    explicit VolSurface(std::vector<VolQuote> quotes);

    [[nodiscard]] double interpolate(double strike, double expiry) const;
    [[nodiscard]] std::vector<SuspiciousQuote> detect_suspicious_quotes(
        double max_absolute_spread = 0.5) const;
    [[nodiscard]] std::vector<std::string> arbitrage_warnings() const;
    [[nodiscard]] const std::vector<VolQuote>& quotes() const noexcept;

private:
    std::vector<VolQuote> quotes_{};
    std::vector<double> strikes_{};
    std::vector<double> expiries_{};

    [[nodiscard]] double quote_vol(double strike, double expiry) const;
};

}  // namespace options

#endif  // OPTIONS_VOL_SURFACE_HPP

