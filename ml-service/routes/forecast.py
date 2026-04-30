"""
Route: /api/ml/forecast
ARIMA / exponential smoothing forecast for next month's spending per category.
"""

from flask import Blueprint, request, jsonify
import pandas as pd
import numpy as np
from statsmodels.tsa.holtwinters import SimpleExpSmoothing

forecast_bp = Blueprint("forecast", __name__)


def forecast_category(amounts: list[float], periods: int = 1) -> dict:
    """
    Given a list of monthly totals, forecast the next `periods` months.
    Falls back to mean if insufficient data.
    """
    series = np.array(amounts, dtype=float)

    if len(series) < 3:
        mean_val = float(np.mean(series)) if len(series) > 0 else 0.0
        return {
            "forecast": [round(mean_val, 2)] * periods,
            "method":   "mean_fallback",
            "trend":    "insufficient_data",
        }

    try:
        model   = SimpleExpSmoothing(series, initialization_method="estimated")
        fit     = model.fit(optimized=True)
        forecast = fit.forecast(periods)

        # Determine trend
        recent_avg = np.mean(series[-2:])
        older_avg  = np.mean(series[:-2]) if len(series) > 2 else recent_avg
        if recent_avg > older_avg * 1.05:
            trend = "increasing"
        elif recent_avg < older_avg * 0.95:
            trend = "decreasing"
        else:
            trend = "stable"

        return {
            "forecast": [round(float(v), 2) for v in forecast],
            "method":   "exponential_smoothing",
            "trend":    trend,
        }
    except Exception:
        mean_val = float(np.mean(series))
        return {
            "forecast": [round(mean_val, 2)] * periods,
            "method":   "mean_fallback",
            "trend":    "stable",
        }


@forecast_bp.route("/forecast", methods=["POST"])
def forecast():
    """
    Input:
    {
      "monthly_totals": {
        "Food & Drink":  [320, 310, 355, 340],
        "Transport":     [120, 130, 115],
        "Shopping":      [250, 400, 180, 300]
      },
      "periods": 1
    }
    Output:
    {
      "forecasts": {
        "Food & Drink":  { "forecast": [348.0], "trend": "stable" },
        ...
      }
    }
    """
    data          = request.get_json()
    monthly_totals = data.get("monthly_totals", {})
    periods        = int(data.get("periods", 1))

    if not monthly_totals:
        return jsonify({"error": "monthly_totals is required"}), 400

    forecasts = {}
    for category, amounts in monthly_totals.items():
        forecasts[category] = forecast_category(amounts, periods)

    # Total forecast
    all_totals = [sum(v) for v in zip(*monthly_totals.values())]
    forecasts["_total"] = forecast_category(all_totals, periods)

    return jsonify({"forecasts": forecasts})
