"""Plotly chart factories for options research outputs."""

from __future__ import annotations

import plotly.graph_objects as go

from options_lab.analytics import HedgingResult, VolQuote


def hedging_figure(result: HedgingResult) -> go.Figure:
    figure = go.Figure()
    figure.add_trace(
        go.Scatter(
            y=result.spot_path,
            mode="lines",
            name="spot",
            line={"color": "#2bd188"},
        )
    )
    figure.add_trace(
        go.Scatter(
            y=result.delta_path,
            mode="lines",
            name="delta",
            yaxis="y2",
            line={"color": "#f2d790"},
        )
    )
    figure.update_layout(
        template="plotly_dark",
        title="Delta Hedging Path",
        yaxis={"title": "Spot"},
        yaxis2={"title": "Delta", "overlaying": "y", "side": "right"},
    )
    return figure


def stress_heatmap(rows: list[dict[str, float | str]]) -> go.Figure:
    labels = [str(row["label"]) for row in rows]
    pnls = [float(row["pnl"]) for row in rows]
    figure = go.Figure(
        data=go.Heatmap(
            z=[pnls],
            x=labels,
            y=["PnL"],
            colorscale="RdYlGn",
            colorbar={"title": "PnL"},
        )
    )
    figure.update_layout(template="plotly_dark", title="Stress-Test PnL")
    return figure


def vol_surface_figure(quotes: list[VolQuote]) -> go.Figure:
    strikes = sorted({quote.strike for quote in quotes})
    expiries = sorted({quote.expiry for quote in quotes})
    grid = []
    for expiry in expiries:
        row = []
        for strike in strikes:
            match = next(
                quote for quote in quotes if quote.strike == strike and quote.expiry == expiry
            )
            row.append(match.implied_vol)
        grid.append(row)
    figure = go.Figure(data=go.Surface(x=strikes, y=expiries, z=grid, colorscale="Viridis"))
    figure.update_layout(
        template="plotly_dark",
        title="Implied Volatility Surface",
        scene={
            "xaxis_title": "Strike",
            "yaxis_title": "Expiry",
            "zaxis_title": "IV",
        },
    )
    return figure

