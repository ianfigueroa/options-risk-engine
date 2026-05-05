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
  cpp/src/HedgingSimulator.cpp
  cpp/src/ImpliedVol.cpp
  cpp/src/LocalVolatility.cpp
  cpp/src/MonteCarlo.cpp
  cpp/src/Portfolio.cpp
  cpp/src/RiskEngine.cpp
  cpp/src/StochasticVolatility.cpp
  cpp/src/VolSurface.cpp
)

target_include_directories(options_core
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/cpp/include
)

target_compile_features(options_core PUBLIC cxx_std_20)

if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/cpp/tests/test_black_scholes.cpp)
  enable_testing()
  foreach(test_target IN ITEMS
      black_scholes greeks implied_vol portfolio_risk
      numerical_models vol_surface hedging_simulator advanced_vol_models)
    add_executable(options_${test_target}_tests cpp/tests/test_${test_target}.cpp)
    target_link_libraries(options_${test_target}_tests PRIVATE options_core)
    add_test(NAME options_${test_target}_tests COMMAND options_${test_target}_tests)
  endforeach()
endif()

if(OPTIONS_BUILD_BENCHMARKS)
  add_executable(price_many_options cpp/benchmarks/price_many_options.cpp)
  target_link_libraries(price_many_options PRIVATE options_core)
endif()

if(OPTIONS_BUILD_PYTHON)
  set(PYBIND11_FINDPYTHON ON)
  find_package(Python COMPONENTS Interpreter Development.Module REQUIRED)
  find_package(pybind11 CONFIG REQUIRED)
  pybind11_add_module(_options_core python/options_lab/bindings/module.cpp)
  target_link_libraries(_options_core PRIVATE options_core)
  set_target_properties(_options_core PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/python/options_lab/bindings
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/python/options_lab/bindings
  )
endif()
