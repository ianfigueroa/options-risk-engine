#ifndef OPTIONS_TYPES_HPP
#define OPTIONS_TYPES_HPP

#include <stdexcept>
#include <string>
#include <cstddef>
#include <cstdint>

namespace options {

enum class OptionType {
    call,
    put
};

enum class ExerciseType {
    european,
    american
};

struct OptionContract {
    OptionType type{OptionType::call};
    ExerciseType exercise{ExerciseType::european};
    double strike{100.0};
    double time_to_expiry{1.0};
};

struct MarketData {
    double spot{100.0};
    double rate{0.0};
    double dividend_yield{0.0};
    double volatility{0.2};
};

struct Greeks {
    double delta{0.0};
    double gamma{0.0};
    double vega{0.0};
    double theta{0.0};
    double rho{0.0};
};

struct Position {
    OptionContract contract{};
    double quantity{1.0};
};

struct PathConfig {
    std::size_t paths{10000};
    std::size_t steps{252};
    std::uint64_t seed{42};
    bool antithetic{true};
};

class OptionsError : public std::runtime_error {
public:
    explicit OptionsError(const std::string& message)
        : std::runtime_error(message) {}
};

inline void validate_contract(const OptionContract& contract) {
    if (contract.strike <= 0.0) {
        throw std::invalid_argument("strike must be positive");
    }
    if (contract.time_to_expiry < 0.0) {
        throw std::invalid_argument("time to expiry cannot be negative");
    }
}

inline void validate_market(const MarketData& market) {
    if (market.spot <= 0.0) {
        throw std::invalid_argument("spot must be positive");
    }
    if (market.volatility < 0.0) {
        throw std::invalid_argument("volatility cannot be negative");
    }
}

inline double intrinsic_value(const OptionContract& contract, const double spot) {
    validate_contract(contract);
    if (spot < 0.0) {
        throw std::invalid_argument("spot cannot be negative");
    }

    if (contract.type == OptionType::call) {
        return spot > contract.strike ? spot - contract.strike : 0.0;
    }
    return contract.strike > spot ? contract.strike - spot : 0.0;
}

}  // namespace options

#endif  // OPTIONS_TYPES_HPP
