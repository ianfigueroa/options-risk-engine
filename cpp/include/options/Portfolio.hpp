#ifndef OPTIONS_PORTFOLIO_HPP
#define OPTIONS_PORTFOLIO_HPP

#include "options/Types.hpp"

#include <vector>

namespace options {

class Portfolio {
public:
    void add_position(const Position& position);
    void set_underlying_units(double units);
    void set_cash(double cash);

    [[nodiscard]] double underlying_units() const noexcept;
    [[nodiscard]] double cash() const noexcept;
    [[nodiscard]] const std::vector<Position>& positions() const noexcept;

    [[nodiscard]] double market_value(const MarketData& market) const;
    [[nodiscard]] Greeks aggregate_greeks(const MarketData& market) const;

private:
    std::vector<Position> positions_{};
    double underlying_units_{0.0};
    double cash_{0.0};
};

}  // namespace options

#endif  // OPTIONS_PORTFOLIO_HPP

