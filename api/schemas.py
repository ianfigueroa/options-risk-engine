"""Pydantic request schemas for the analytics API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class OptionSchema(BaseModel):
    kind: Literal["call", "put"]
    strike: float = Field(gt=0.0)
    time_to_expiry: float = Field(ge=0.0)
    exercise: Literal["european", "american"] = "european"


class MarketSchema(BaseModel):
    spot: float = Field(gt=0.0)
    rate: float
    dividend_yield: float = 0.0
    volatility: float = Field(ge=0.0)


class PriceRequest(BaseModel):
    option: OptionSchema
    market: MarketSchema


class ImpliedVolRequest(PriceRequest):
    option_price: float = Field(ge=0.0)
    initial_guess: float = Field(default=0.2, gt=0.0, le=5.0)


class PositionSchema(BaseModel):
    option: OptionSchema
    quantity: float


class PortfolioRequest(BaseModel):
    positions: list[PositionSchema] = Field(default_factory=list)
    underlying_units: float = 0.0
    cash: float = 0.0
    market: MarketSchema


class HedgingConfigSchema(BaseModel):
    steps: int = Field(default=252, ge=1, le=10000)
    rebalance_interval: int = Field(default=1, ge=1)
    seed: int = Field(default=42, ge=0)
    assumed_volatility: float = Field(default=0.20, gt=0.0)
    realized_volatility: float = Field(default=0.20, ge=0.0)
    transaction_cost_rate: float = Field(default=0.0, ge=0.0)
    jump_intensity: float = Field(default=0.0, ge=0.0)
    jump_mean: float = 0.0
    jump_stddev: float = Field(default=0.0, ge=0.0)


class HedgingRequest(PriceRequest):
    config: HedgingConfigSchema = Field(default_factory=HedgingConfigSchema)


class VolSurfaceRequest(BaseModel):
    spot: float = Field(gt=0.0)
    expiries: list[float] = Field(min_length=1)
    strikes: list[float] = Field(min_length=1)
    query_strike: float = Field(gt=0.0)
    query_expiry: float = Field(gt=0.0)

