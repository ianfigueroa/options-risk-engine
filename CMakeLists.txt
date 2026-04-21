cmake_minimum_required(VERSION 3.24)
project(options_risk_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(OPTIONS_BUILD_PYTHON "Build pybind11 extension" OFF)
option(OPTIONS_BUILD_BENCHMARKS "Build benchmark executables" ON)

add_library(options_core
  cpp/src/BlackScholes.cpp
  cpp/src/BinomialTree.cpp
  cpp/src/Greeks.cpp
  cpp/src/ImpliedVol.cpp
  cpp/src/MonteCarlo.cpp
  cpp/src/Portfolio.cpp
  cpp/src/RiskEngine.cpp
)

target_include_directories(options_core
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/cpp/include
)

target_compile_features(options_core PUBLIC cxx_std_20)

add_executable(options_cpp_tests cpp/tests/test_black_scholes.cpp)
target_link_libraries(options_cpp_tests PRIVATE options_core)

enable_testing()
add_test(NAME options_cpp_tests COMMAND options_cpp_tests)

add_executable(options_greeks_tests cpp/tests/test_greeks.cpp)
target_link_libraries(options_greeks_tests PRIVATE options_core)
add_test(NAME options_greeks_tests COMMAND options_greeks_tests)

add_executable(options_iv_tests cpp/tests/test_implied_vol.cpp)
target_link_libraries(options_iv_tests PRIVATE options_core)
add_test(NAME options_iv_tests COMMAND options_iv_tests)

add_executable(options_portfolio_tests cpp/tests/test_portfolio_risk.cpp)
target_link_libraries(options_portfolio_tests PRIVATE options_core)
add_test(NAME options_portfolio_tests COMMAND options_portfolio_tests)

add_executable(options_numerical_tests cpp/tests/test_numerical_models.cpp)
target_link_libraries(options_numerical_tests PRIVATE options_core)
add_test(NAME options_numerical_tests COMMAND options_numerical_tests)

if(OPTIONS_BUILD_BENCHMARKS)
  add_executable(price_many_options cpp/benchmarks/price_many_options.cpp)
  target_link_libraries(price_many_options PRIVATE options_core)
endif()

if(OPTIONS_BUILD_PYTHON)
  find_package(pybind11 CONFIG REQUIRED)
  pybind11_add_module(_options_core python/options_lab/bindings/module.cpp)
  target_link_libraries(_options_core PRIVATE options_core)
endif()
