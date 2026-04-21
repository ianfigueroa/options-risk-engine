#include "options/Portfolio.hpp"

#include "options/BlackScholes.hpp"
#include "options/Greeks.hpp"

#include <cmath>
#include <stdexcept>

namespace options {

void Portfolio::add_position(const Position& position) {
    validate_contract(position.contract);
    if (!std::isfinite(position.quantity)) {
        throw std::invalid_argument("position quantity must be finite");
    }
    positions_.push_back(position);
}

void Portfolio::set_underlying_units(const double units) {
    if (!std::isfinite(units)) {
        throw std::invalid_argument("underlying units must be finite");
    }
    underlying_units_ = units;
}

void Portfolio::set_cash(const double cash) {
    if (!std::isfinite(cash)) {
        throw std::invalid_argument("cash must be finite");
    }
    cash_ = cash;
}

double Portfolio::underlying_units() const noexcept {
    return underlying_units_;
}

double Portfolio::cash() const noexcept {
    return cash_;
}

const std::vector<Position>& Portfolio::positions() const noexcept {
    return positions_;
}

double Portfolio::market_value(const MarketData& market) const {
    validate_market(market);

    double value = underlying_units_ * market.spot + cash_;
    for (const auto& position : positions_) {
        value += position.quantity * black_scholes_price(position.contract, market);
    }
    return value;
}

Greeks Portfolio::aggregate_greeks(const MarketData& market) const {
    validate_market(market);

    Greeks aggregate{};
    aggregate.delta = underlying_units_;
    for (const auto& position : positions_) {
        const auto greeks = black_scholes_greeks(position.contract, market);
        aggregate.delta += position.quantity * greeks.delta;
        aggregate.gamma += position.quantity * greeks.gamma;
        aggregate.vega += position.quantity * greeks.vega;
        aggregate.theta += position.quantity * greeks.theta;
        aggregate.rho += position.quantity * greeks.rho;
    }
    return aggregate;
}

}  // namespace options

