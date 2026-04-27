#include "options/BinomialTree.hpp"
#include "options/BlackScholes.hpp"
#include "options/Greeks.hpp"
#include "options/HedgingSimulator.hpp"
#include "options/ImpliedVol.hpp"
#include "options/LocalVolatility.hpp"
#include "options/MonteCarlo.hpp"
#include "options/RiskEngine.hpp"
#include "options/StochasticVolatility.hpp"
#include "options/VolSurface.hpp"

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

namespace py = pybind11;

PYBIND11_MODULE(_options_core, module) {
    module.doc() = "C++20 options analytics core";

    py::enum_<options::OptionType>(module, "OptionType")
        .value("call", options::OptionType::call)
        .value("put", options::OptionType::put);

    py::enum_<options::ExerciseType>(module, "ExerciseType")
        .value("european", options::ExerciseType::european)
        .value("american", options::ExerciseType::american);

    py::class_<options::OptionContract>(module, "OptionContract")
        .def(py::init<>())
        .def_readwrite("type", &options::OptionContract::type)
        .def_readwrite("exercise", &options::OptionContract::exercise)
        .def_readwrite("strike", &options::OptionContract::strike)
        .def_readwrite("time_to_expiry", &options::OptionContract::time_to_expiry);

    py::class_<options::MarketData>(module, "MarketData")
        .def(py::init<>())
        .def_readwrite("spot", &options::MarketData::spot)
        .def_readwrite("rate", &options::MarketData::rate)
        .def_readwrite("dividend_yield", &options::MarketData::dividend_yield)
        .def_readwrite("volatility", &options::MarketData::volatility);

    py::class_<options::Greeks>(module, "Greeks")
        .def_readwrite("delta", &options::Greeks::delta)
        .def_readwrite("gamma", &options::Greeks::gamma)
        .def_readwrite("vega", &options::Greeks::vega)
        .def_readwrite("theta", &options::Greeks::theta)
        .def_readwrite("rho", &options::Greeks::rho);

    py::class_<options::Position>(module, "Position")
        .def(py::init<>())
        .def_readwrite("contract", &options::Position::contract)
        .def_readwrite("quantity", &options::Position::quantity);

    py::class_<options::PathConfig>(module, "PathConfig")
        .def(py::init<>())
        .def_readwrite("paths", &options::PathConfig::paths)
        .def_readwrite("steps", &options::PathConfig::steps)
        .def_readwrite("seed", &options::PathConfig::seed)
        .def_readwrite("antithetic", &options::PathConfig::antithetic);

    py::class_<options::LocalVolModel>(module, "LocalVolModel")
        .def(py::init<>())
        .def_readwrite("base_volatility", &options::LocalVolModel::base_volatility)
        .def_readwrite("spot_slope", &options::LocalVolModel::spot_slope)
        .def_readwrite("time_slope", &options::LocalVolModel::time_slope)
        .def_readwrite("min_volatility", &options::LocalVolModel::min_volatility)
        .def_readwrite("max_volatility", &options::LocalVolModel::max_volatility);

    py::class_<options::HestonParams>(module, "HestonParams")
        .def(py::init<>())
        .def_readwrite("initial_variance", &options::HestonParams::initial_variance)
        .def_readwrite("long_run_variance", &options::HestonParams::long_run_variance)
        .def_readwrite("mean_reversion", &options::HestonParams::mean_reversion)
        .def_readwrite("vol_of_vol", &options::HestonParams::vol_of_vol)
        .def_readwrite("correlation", &options::HestonParams::correlation);

    py::class_<options::Portfolio>(module, "Portfolio")
        .def(py::init<>())
        .def("add_position", &options::Portfolio::add_position)
        .def("set_underlying_units", &options::Portfolio::set_underlying_units)
        .def("set_cash", &options::Portfolio::set_cash)
        .def("market_value", &options::Portfolio::market_value)
        .def("aggregate_greeks", &options::Portfolio::aggregate_greeks);

    py::class_<options::MonteCarloConfig>(module, "MonteCarloConfig")
        .def(py::init<>())
        .def_readwrite("paths", &options::MonteCarloConfig::paths)
        .def_readwrite("seed", &options::MonteCarloConfig::seed)
        .def_readwrite("antithetic", &options::MonteCarloConfig::antithetic);

    py::class_<options::HedgingConfig>(module, "HedgingConfig")
        .def(py::init<>())
        .def_readwrite("steps", &options::HedgingConfig::steps)
        .def_readwrite("rebalance_interval", &options::HedgingConfig::rebalance_interval)
        .def_readwrite("seed", &options::HedgingConfig::seed)
        .def_readwrite("assumed_volatility", &options::HedgingConfig::assumed_volatility)
        .def_readwrite("realized_volatility", &options::HedgingConfig::realized_volatility)
        .def_readwrite("transaction_cost_rate", &options::HedgingConfig::transaction_cost_rate)
        .def_readwrite("jump_intensity", &options::HedgingConfig::jump_intensity)
        .def_readwrite("jump_mean", &options::HedgingConfig::jump_mean)
        .def_readwrite("jump_stddev", &options::HedgingConfig::jump_stddev);

    py::class_<options::HedgingResult>(module, "HedgingResult")
        .def_readwrite("option_premium", &options::HedgingResult::option_premium)
        .def_readwrite("terminal_spot", &options::HedgingResult::terminal_spot)
        .def_readwrite("hedging_error", &options::HedgingResult::hedging_error)
        .def_readwrite("transaction_costs", &options::HedgingResult::transaction_costs)
        .def_readwrite("spot_path", &options::HedgingResult::spot_path)
        .def_readwrite("delta_path", &options::HedgingResult::delta_path);

    module.def("black_scholes_price", &options::black_scholes_price);
    module.def("black_scholes_greeks", &options::black_scholes_greeks);
    module.def("implied_volatility", &options::implied_volatility,
        py::arg("contract"), py::arg("market"), py::arg("option_price"),
        py::arg("initial_guess") = 0.2, py::arg("tolerance") = 1.0e-10,
        py::arg("max_iterations") = 100);
    module.def("binomial_tree_price", &options::binomial_tree_price);
    module.def("monte_carlo_price", &options::monte_carlo_price,
        py::arg("contract"), py::arg("market"), py::arg("config") = options::MonteCarloConfig{});
    module.def("simulate_delta_hedge", &options::simulate_delta_hedge,
        py::arg("contract"), py::arg("market"), py::arg("config") = options::HedgingConfig{});
    module.def("local_volatility", &options::local_volatility);
    module.def("local_vol_monte_carlo_price", &options::local_vol_monte_carlo_price,
        py::arg("contract"), py::arg("market"), py::arg("model"),
        py::arg("config") = options::PathConfig{});
    module.def("stochastic_vol_monte_carlo_price", &options::stochastic_vol_monte_carlo_price,
        py::arg("contract"), py::arg("market"), py::arg("params"),
        py::arg("config") = options::PathConfig{});
}
