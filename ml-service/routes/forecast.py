"""
Route: /api/ml/forecast  (monthly) and /api/ml/forecast/daily (daily with weekly seasonality)
"""

import time
from datetime import date, timedelta
from flask import Blueprint, request, jsonify
import numpy as np
from statsmodels.tsa.holtwinters import SimpleExpSmoothing, ExponentialSmoothing

forecast_bp = Blueprint("forecast", __name__)

SEASONAL_PERIODS = 12   # monthly data, yearly seasonality
WEEKLY_PERIODS   = 7    # daily data, weekly seasonality

_MODEL_NAMES = {
    "holt_winters_seasonal": "Holt-Winters (seasonal + trend)",
    "holt_winters_trend":    "Holt-Winters (damped trend)",
    "holt_winters_weekly":   "Holt-Winters (weekly seasonal)",
    "simple_exp_smoothing":  "Simple Exponential Smoothing",
    "mean_fallback":         "Mean (insufficient data)",
}


def _trend(series: np.ndarray) -> str:
    recent_avg = np.mean(series[-2:])
    older_avg  = np.mean(series[:-2]) if len(series) > 2 else recent_avg
    if recent_avg > older_avg * 1.05:
        return "increasing"
    if recent_avg < older_avg * 0.95:
        return "decreasing"
    return "stable"


# ── Monthly forecast ─────────────────────────────────────────────────────────

def forecast_category(amounts: list[float], periods: int = 1) -> dict:
    """
    Model selection (monthly data):
      >= 24 months  →  Holt-Winters full (additive trend + additive seasonal, period=12)
      >= 4  months  →  Holt-Winters damped trend (no seasonality)
      >= 3  months  →  Simple Exponential Smoothing
      <  3  months  →  Mean fallback
    """
    series     = np.array(amounts, dtype=float)
    n          = len(series)
    hist_avg   = round(float(np.mean(series)), 2) if n > 0 else 0.0
    last_month = round(float(series[-1]),      2) if n > 0 else 0.0

    if n < 3:
        margin = round(hist_avg * 0.15, 2)
        return {
            "forecast":        [round(hist_avg, 2)] * periods,
            "target_value":    round(hist_avg, 2),
            "model":           "mean_fallback",
            "model_label":     _MODEL_NAMES["mean_fallback"],
            "trend":           "insufficient_data",
            "historical_avg":  hist_avg,
            "last_month":      last_month,
            "history_count":   n,
            "confidence_low":  round(max(0.0, hist_avg - margin), 2),
            "confidence_high": round(hist_avg + margin, 2),
        }

    def _build_model(s):
        if len(s) >= 2 * SEASONAL_PERIODS:
            return ExponentialSmoothing(
                s, trend="add", seasonal="add",
                seasonal_periods=SEASONAL_PERIODS,
                initialization_method="estimated",
            ), "holt_winters_seasonal"
        if len(s) >= 4:
            return ExponentialSmoothing(
                s, trend="add", damped_trend=True,
                initialization_method="estimated",
            ), "holt_winters_trend"
        return SimpleExpSmoothing(s, initialization_method="estimated"), "simple_exp_smoothing"

    try:
        model_obj, model_key = _build_model(series)
        fit      = model_obj.fit(optimized=True)
        fc_array = fit.forecast(periods)
        fval     = max(0.0, float(fc_array[-1]))

        residuals = series - fit.fittedvalues
        std = float(np.std(residuals)) if len(residuals) > 1 else float(np.std(series)) * 0.2

        return {
            "forecast":        [round(max(0.0, float(v)), 2) for v in fc_array],
            "target_value":    round(fval, 2),
            "model":           model_key,
            "model_label":     _MODEL_NAMES[model_key],
            "trend":           _trend(series),
            "historical_avg":  hist_avg,
            "last_month":      last_month,
            "history_count":   n,
            "confidence_low":  round(max(0.0, fval - std), 2),
            "confidence_high": round(fval + std, 2),
        }

    except Exception:
        try:
            model_obj, model_key = _build_model(series[:max(3, n - 1)])
            fit      = model_obj.fit(optimized=True)
            fc_array = fit.forecast(periods)
            fval     = max(0.0, float(fc_array[-1]))
            margin   = round(float(np.std(series)) * 0.5, 2)
            return {
                "forecast":        [round(max(0.0, float(v)), 2) for v in fc_array],
                "target_value":    round(fval, 2),
                "model":           model_key,
                "model_label":     _MODEL_NAMES[model_key] + " (fallback)",
                "trend":           _trend(series),
                "historical_avg":  hist_avg,
                "last_month":      last_month,
                "history_count":   n,
                "confidence_low":  round(max(0.0, fval - margin), 2),
                "confidence_high": round(fval + margin, 2),
            }
        except Exception:
            margin = round(float(np.std(series)) * 0.5, 2)
            return {
                "forecast":        [round(hist_avg, 2)] * periods,
                "target_value":    round(hist_avg, 2),
                "model":           "mean_fallback",
                "model_label":     _MODEL_NAMES["mean_fallback"],
                "trend":           "stable",
                "historical_avg":  hist_avg,
                "last_month":      last_month,
                "history_count":   n,
                "confidence_low":  round(max(0.0, hist_avg - margin), 2),
                "confidence_high": round(hist_avg + margin, 2),
            }


# ── Daily forecast ───────────────────────────────────────────────────────────

def _apply_monthly_overlay(fc_vals: list, residuals, series, start_date_str: str) -> list:
    """
    Detect day-of-month patterns that the weekly HW model missed (e.g. rent on the 1st)
    by grouping residuals by day-of-month across the history window.
    Only applies a correction when the mean residual for a day is consistently large
    (> 0.5 * series std), which requires at least 2 historical occurrences.
    """
    if not start_date_str:
        return fc_vals
    try:
        hist_start    = date.fromisoformat(start_date_str)
        dom_residuals = {}
        for i, resid in enumerate(residuals):
            dom = (hist_start + timedelta(days=int(i))).day
            dom_residuals.setdefault(dom, []).append(float(resid))

        series_std = float(np.std(series))
        threshold  = series_std * 0.5

        dom_correction = {
            dom: float(np.mean(resids))
            for dom, resids in dom_residuals.items()
            if len(resids) >= 2 and abs(float(np.mean(resids))) > threshold
        }
        if not dom_correction:
            return fc_vals

        return [
            round(max(0.0, fc_vals[i] + dom_correction.get(i + 1, 0.0)), 2)
            for i in range(len(fc_vals))
        ]
    except Exception:
        return fc_vals  # never break the main forecast


def forecast_daily(daily_amounts: list[float], periods: int = 30,
                   start_date_str: str = None) -> dict:
    """
    Daily spending forecast with weekly seasonality.
      >= 14 days  →  Holt-Winters additive weekly seasonal (period=7)
      >= 3  days  →  Simple Exponential Smoothing
      <  3  days  →  Mean fallback
    Returns per-day forecast array + residual std for confidence band.
    """
    series   = np.array(daily_amounts, dtype=float)
    n        = len(series)
    hist_avg = round(float(np.mean(series)), 2) if n > 0 else 0.0

    if n < 3:
        std = round(hist_avg * 0.3, 2)
        fc_vals   = [round(hist_avg, 2)] * periods
        conf_low  = [round(max(0.0, v - std), 2) for v in fc_vals]
        conf_high = [round(v + std, 2)           for v in fc_vals]
        return {
            "forecast":         fc_vals,
            "confidence_low":   conf_low,
            "confidence_high":  conf_high,
            "model":            "mean_fallback",
            "model_label":      _MODEL_NAMES["mean_fallback"],
            "history_count":    n,
            "std":              std,
        }

    def _build_daily_model(s):
        if len(s) >= 2 * WEEKLY_PERIODS:
            return ExponentialSmoothing(
                s, trend="add", seasonal="add",
                seasonal_periods=WEEKLY_PERIODS,
                initialization_method="estimated",
            ), "holt_winters_weekly"
        return SimpleExpSmoothing(s, initialization_method="estimated"), "simple_exp_smoothing"

    def _make_bounds(fc_vals, residuals):
        """MAD-based bounds — tighter and more robust than raw std on heavy-tailed daily data."""
        raw_std  = float(np.std(residuals)) if len(residuals) > 1 else float(np.std(series)) * 0.2
        mad      = float(np.median(np.abs(residuals - np.median(residuals))))
        # MAD * 1.4826 ≈ 1-sigma for normal data; cap at raw_std to avoid absurdly wide bands
        margin   = min(mad * 1.4826, raw_std * 0.6)
        margin   = max(margin, 1.0)          # floor so band is always non-zero
        conf_low  = [round(max(0.0, v - margin), 2) for v in fc_vals]
        conf_high = [round(v + margin, 2)            for v in fc_vals]
        return round(raw_std, 2), round(margin, 2), conf_low, conf_high

    try:
        model_obj, model_key = _build_daily_model(series)
        fit      = model_obj.fit(optimized=True)
        fc_array = fit.forecast(periods)

        # Bias correction: scale forecast so its implied mean matches the actual series mean.
        # HW can drift high when trained on a series with large outliers (e.g. rent spikes),
        # since the level parameter absorbs those into the baseline.
        fitted_mean = float(np.mean(fit.fittedvalues))
        actual_mean = float(np.mean(series))
        bias = (actual_mean / fitted_mean) if fitted_mean > 0 else 1.0
        bias = max(0.4, min(bias, 2.5))  # sanity clamp
        fc_vals  = [round(max(0.0, float(v) * bias), 2) for v in fc_array]

        residuals = series - fit.fittedvalues
        fc_vals   = _apply_monthly_overlay(fc_vals, residuals, series, start_date_str)
        std, margin, conf_low, conf_high = _make_bounds(fc_vals, residuals)

        return {
            "forecast":         fc_vals,
            "confidence_low":   conf_low,
            "confidence_high":  conf_high,
            "model":            model_key,
            "model_label":      _MODEL_NAMES[model_key],
            "history_count":    n,
            "std":              std,
        }

    except Exception:
        try:
            model_obj, model_key = _build_daily_model(series[:max(3, n - 1)])
            fit      = model_obj.fit(optimized=True)
            fc_array = fit.forecast(periods)
            fc_vals  = [round(max(0.0, float(v)), 2) for v in fc_array]
            residuals = series - fit.fittedvalues
            fc_vals   = _apply_monthly_overlay(fc_vals, residuals, series, start_date_str)
            std, margin, conf_low, conf_high = _make_bounds(fc_vals, residuals)
            return {
                "forecast":         fc_vals,
                "confidence_low":   conf_low,
                "confidence_high":  conf_high,
                "model":            model_key,
                "model_label":      _MODEL_NAMES[model_key] + " (fallback)",
                "history_count":    n,
                "std":              std,
            }
        except Exception:
            std = round(float(np.std(series)) * 0.5, 2)
            fc_vals   = [round(hist_avg, 2)] * periods
            conf_low  = [round(max(0.0, v - std), 2) for v in fc_vals]
            conf_high = [round(v + std, 2)            for v in fc_vals]
            return {
                "forecast":         fc_vals,
                "confidence_low":   conf_low,
                "confidence_high":  conf_high,
                "model":            "mean_fallback",
                "model_label":      _MODEL_NAMES["mean_fallback"],
                "history_count":    n,
                "std":              std,
            }


# ── Insights ─────────────────────────────────────────────────────────────────

def compute_insights(monthly_totals: dict, forecasts: dict) -> dict:
    """
    Derive high-level insights from computed forecasts + history.
    Returned as `insights` in the /forecast response — no extra ML call needed.
    """
    risers, fallers, watch_cats = [], [], []
    model_dist, conf_scores    = {}, []
    savings_total              = 0.0

    for cat, fc_data in forecasts.items():
        if cat == "_total":
            continue
        model_key = fc_data.get("model", "unknown")
        model_dist[model_key] = model_dist.get(model_key, 0) + 1
        conf_scores.append(fc_data.get("history_count", 0))

        forecast_val = float(fc_data.get("target_value") or 0)
        last_month   = float(fc_data.get("last_month")   or 0)
        hist_avg     = float(fc_data.get("historical_avg") or 0)

        # Month-over-month delta
        if last_month > 0:
            pct_change = ((forecast_val - last_month) / last_month) * 100
            entry = {
                "category":   cat,
                "forecast":   round(forecast_val, 2),
                "last_month": round(last_month,   2),
                "hist_avg":   round(hist_avg,     2),
                "pct_change": round(pct_change,   1),
                "trend":      fc_data.get("trend", "stable"),
                "conf_low":   fc_data.get("confidence_low",  0),
                "conf_high":  fc_data.get("confidence_high", 0),
            }
            if pct_change > 5:
                risers.append(entry)
            elif pct_change < -5:
                savings_total += max(0.0, last_month - forecast_val)
                fallers.append(entry)

        # Watch: forecast significantly above historical average
        if hist_avg > 0 and forecast_val > hist_avg * 1.25:
            ratio = round(forecast_val / hist_avg, 1)
            watch_cats.append({
                "category": cat,
                "forecast": round(forecast_val, 2),
                "hist_avg": round(hist_avg, 2),
                "ratio":    ratio,
                "reason":   f"Forecast ${forecast_val:.0f} is {ratio}× your ${hist_avg:.0f} average",
                "severity": "high" if ratio >= 1.6 else "medium",
            })

    risers.sort(key=lambda x: x["pct_change"], reverse=True)
    fallers.sort(key=lambda x: x["pct_change"])
    watch_cats.sort(key=lambda x: x["ratio"], reverse=True)

    avg_history   = sum(conf_scores) / len(conf_scores) if conf_scores else 0
    has_seasonal  = "holt_winters_seasonal" in model_dist
    if avg_history >= 12 and has_seasonal:
        confidence_tier = "high"
    elif avg_history >= 4:
        confidence_tier = "medium"
    else:
        confidence_tier = "low"

    return {
        "top_risers":         risers[:3],
        "top_fallers":        fallers[:3],
        "watch_categories":   watch_cats[:3],
        "savings_potential":  round(max(0.0, savings_total), 2),
        "confidence_tier":    confidence_tier,
        "model_distribution": model_dist,
        "avg_history_months": round(avg_history, 1),
    }


# ── Seasonality Profile ──────────────────────────────────────────────────────

def compute_seasonality_profile(monthly_totals: dict, month_labels: list) -> dict:
    """
    Per-category seasonality index for each calendar month (1-12).
    index[m] = avg_spend_in_calendar_month_m / overall_monthly_avg
    Values > 1.0 = above-average spending in that month.
    Requires at least 12 labeled months.
    """
    if len(month_labels) < 12:
        return {}

    profiles = {}
    for cat, amounts in monthly_totals.items():
        if len(amounts) < 12:
            continue

        buckets: dict[int, list] = {m: [] for m in range(1, 13)}
        for label, amt in zip(month_labels, amounts):
            try:
                month_num = int(label.split('-')[1])
                buckets[month_num].append(float(amt))
            except (ValueError, IndexError):
                continue

        month_avgs   = {m: float(np.mean(v)) if v else 0.0 for m, v in buckets.items()}
        non_zero     = [v for v in month_avgs.values() if v > 0]
        if not non_zero:
            continue
        overall_avg  = float(np.mean(non_zero))
        if overall_avg <= 0:
            continue

        index        = [round(month_avgs[m] / overall_avg, 3) for m in range(1, 13)]
        peak_month   = int(np.argmax(index)) + 1
        trough_month = int(np.argmin(index)) + 1

        profiles[cat] = {
            "index":        index,
            "peak_month":   peak_month,
            "trough_month": trough_month,
            "avg_spend":    round(overall_avg, 2),
        }

    return profiles


# ── Routes ───────────────────────────────────────────────────────────────────

@forecast_bp.route("/forecast", methods=["POST"])
def forecast():
    data           = request.get_json()
    monthly_totals = data.get("monthly_totals", {})
    periods        = int(data.get("periods", 1))

    if not monthly_totals:
        return jsonify({"error": "monthly_totals is required"}), 400

    t0 = time.time()
    forecasts = {}
    for category, amounts in monthly_totals.items():
        forecasts[category] = forecast_category(amounts, periods)

    all_totals = [sum(v) for v in zip(*monthly_totals.values())]
    forecasts["_total"] = forecast_category(all_totals, periods)

    insights = compute_insights(monthly_totals, forecasts)

    total_ms = round((time.time() - t0) * 1000)
    return jsonify({"forecasts": forecasts, "insights": insights, "timing": {"total_ms": total_ms}})


@forecast_bp.route("/forecast/seasonality", methods=["POST"])
def forecast_seasonality():
    data           = request.get_json()
    monthly_totals = data.get("monthly_totals", {})
    month_labels   = data.get("month_labels",   [])

    if not monthly_totals or not month_labels:
        return jsonify({"error": "monthly_totals and month_labels are required"}), 400

    t0       = time.time()
    profiles = compute_seasonality_profile(monthly_totals, month_labels)
    total_ms = round((time.time() - t0) * 1000)
    return jsonify({"profiles": profiles, "timing": {"total_ms": total_ms}})


@forecast_bp.route("/forecast/daily", methods=["POST"])
def forecast_daily_endpoint():
    data         = request.get_json()
    daily_totals = data.get("daily_totals", [])
    periods      = int(data.get("periods", 30))
    start_date   = data.get("start_date")   # YYYY-MM-DD of first history day

    if not daily_totals:
        return jsonify({"error": "daily_totals is required"}), 400

    t0       = time.time()
    result   = forecast_daily(daily_totals, periods, start_date)
    total_ms = round((time.time() - t0) * 1000)
    return jsonify({**result, "timing": {"total_ms": total_ms}})
