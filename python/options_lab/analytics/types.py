"""Domain dataclasses for option analytics."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class OptionContract:
    kind: str = "call"
    strike: float = 100.0
    time_to_expiry: float = 1.0
    exercise: str = "european"

    def __post_init__(self) -> None:
        kind = self.kind.lower()
        exercise = self.exercise.lower()
        if kind not in {"call", "put"}:
            raise ValueError("kind must be 'call' or 'put'")
        if exercise not in {"european", "american"}:
            raise ValueError("exercise must be 'european' or 'american'")
        if self.strike <= 0.0:
            raise ValueError("strike must be positive")
        if self.time_to_expiry < 0.0:
            raise ValueError("time_to_expiry cannot be negative")
        object.__setattr__(self, "kind", kind)
        object.__setattr__(self, "exercise", exercise)


@dataclass(frozen=True)
class MarketData:
    spot: float = 100.0
    rate: float = 0.0
    dividend_yield: float = 0.0
    volatility: float = 0.2

    def __post_init__(self) -> None:
        if self.spot <= 0.0:
            raise ValueError("spot must be positive")
        if self.volatility < 0.0:
            raise ValueError("volatility cannot be negative")


@dataclass(frozen=True)
class Greeks:
    delta: float = 0.0
    gamma: float = 0.0
    vega: float = 0.0
    theta: float = 0.0
    rho: float = 0.0


@dataclass(frozen=True)
class Position:
    contract: OptionContract
    quantity: float


@dataclass(frozen=True)
class Portfolio:
    positions: list[Position] = field(default_factory=list)
    underlying_units: float = 0.0
    cash: float = 0.0


@dataclass(frozen=True)
class Scenario:
    label: str
    spot_shock: float = 0.0
    vol_shock: float = 0.0
    rate_shock: float = 0.0
    time_decay: float = 0.0


@dataclass(frozen=True)
class VolQuote:
    strike: float
    expiry: float
    implied_vol: float
    bid: float = 0.0
    ask: float = 0.0


@dataclass(frozen=True)
class HedgingConfig:
    steps: int = 252
    rebalance_interval: int = 1
    seed: int = 42
    assumed_volatility: float = 0.20
    realized_volatility: float = 0.20
    transaction_cost_rate: float = 0.0
    jump_intensity: float = 0.0
    jump_mean: float = 0.0
    jump_stddev: float = 0.0


@dataclass(frozen=True)
class HedgingResult:
    option_premium: float
    terminal_spot: float
    hedging_error: float
    transaction_costs: float
    spot_path: list[float]
    delta_path: list[float]


@dataclass(frozen=True)
class PathConfig:
    paths: int = 10000
    steps: int = 252
    seed: int = 42
    antithetic: bool = True


@dataclass(frozen=True)
class LocalVolModel:
    base_volatility: float = 0.20
    spot_slope: float = 0.0
    time_slope: float = 0.0
    min_volatility: float = 0.01
    max_volatility: float = 2.0


@dataclass(frozen=True)
class HestonParams:
    initial_variance: float = 0.04
    long_run_variance: float = 0.04
    mean_reversion: float = 2.0
    vol_of_vol: float = 0.30
    correlation: float = -0.50
