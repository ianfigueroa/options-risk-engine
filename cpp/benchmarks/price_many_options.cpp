#include "options/BlackScholes.hpp"

#include <cstdlib>
#include <chrono>
#include <iostream>

int main(const int argc, char** argv) {
    const int contracts = argc > 1 ? std::atoi(argv[1]) : 100000;
    if (contracts <= 0) {
        std::cerr << "contract count must be positive\n";
        return 1;
    }

    const options::MarketData market{100.0, 0.04, 0.01, 0.22};

    double checksum{0.0};
    const auto start = std::chrono::steady_clock::now();
    for (int index = 0; index < contracts; ++index) {
        const double strike = 75.0 + static_cast<double>(index % 80);
        const double expiry = 0.05 + static_cast<double>(index % 24) / 12.0;
        const options::OptionContract contract{
            index % 2 == 0 ? options::OptionType::call : options::OptionType::put,
            options::ExerciseType::european,
            strike,
            expiry
        };
        checksum += options::black_scholes_price(contract, market);
    }
    const auto end = std::chrono::steady_clock::now();
    const auto elapsed = std::chrono::duration<double, std::milli>(end - start).count();

    std::cout << "priced=" << contracts
              << " elapsed_ms=" << elapsed
              << " checksum=" << checksum << '\n';
}
