"""
Route: /api/ml/anomaly
Isolation Forest detection with rich structured signal output.
Results stored in anomaly_reason as JSON — persisted in DB, no recalculation on read.
"""

import time
import json
from flask import Blueprint, request, jsonify
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

anomaly_bp = Blueprint("anomaly", __name__)


# ── Signal helpers ─────────────────────────────────────────────────────────────

def _risk_score(z_score: float, percentile: int) -> int:
    """0-100 risk score. z=4 contributes ~50, 100th percentile contributes ~50."""
    z_contrib   = min(abs(z_score) / 4.0, 1.0) * 50
    pct_contrib = (percentile / 100.0) * 50
    return min(100, int(z_contrib + pct_contrib))


def _severity(signals: list, z_score: float, percentile: int) -> str:
    has_high = any(s["severity"] == "high" for s in signals)
    has_med  = any(s["severity"] == "medium" for s in signals)
    if has_high or (z_score > 2.5 and percentile > 80):
        return "high"
    if has_med or percentile > 70:
        return "medium"
    return "low"


def compute_signals(i: int, df: pd.DataFrame, amount: float,
                    category: str, description: str) -> dict:
    """
    Derive human-readable signals explaining why transaction i is anomalous.
    Uses statistical context from the full df but excludes the current row.
    """
    signals = []

    # ── Per-category context (exclude self) ────────────────────────────────────
    use_category = category and category not in ("", "Uncategorized", "None")
    cat_df = df[(df["category"] == category) & (df.index != i)] if use_category else pd.DataFrame()

    if len(cat_df) >= 3:
        cat_mean = float(cat_df["amount"].mean())
        cat_std  = float(cat_df["amount"].std(ddof=1)) if len(cat_df) > 1 else 0.0
    else:
        other = df[df.index != i]
        cat_mean = float(other["amount"].mean()) if len(other) > 0 else amount
        cat_std  = float(other["amount"].std(ddof=1)) if len(other) > 1 else 0.0

    z_score   = round((amount - cat_mean) / cat_std, 2) if cat_std > 0 else 0.0
    percentile = int(np.sum(df["amount"].values <= amount) / len(df) * 100)

    cat_label = category if use_category else "your transactions"

    # ── Signal: unusually high amount ─────────────────────────────────────────
    if amount > cat_mean + 2 * (cat_std or 0) and amount > cat_mean * 1.5:
        mult = round(amount / cat_mean, 1) if cat_mean > 0 else None
        signals.append({
            "type":     "high_amount",
            "label":    "Unusually High",
            "detail":   f"${amount:.2f} vs ${cat_mean:.2f} avg in {cat_label}"
                        + (f" — {mult}× above normal" if mult else ""),
            "severity": "high" if z_score > 2.5 else "medium",
        })

    # ── Signal: top percentile ────────────────────────────────────────────────
    if percentile >= 90:
        top = 100 - percentile + 1
        signals.append({
            "type":     "top_percentile",
            "label":    f"Top {top}%",
            "detail":   f"Ranks in the top {top}% of all your transactions by amount",
            "severity": "high" if percentile >= 95 else "medium",
        })

    # ── Signal: new merchant ──────────────────────────────────────────────────
    seen_before = len(df[(df["description"] == description) & (df.index != i)])
    if seen_before == 0:
        signals.append({
            "type":     "new_merchant",
            "label":    "New Merchant",
            "detail":   "First time this merchant appears in your transaction history",
            "severity": "medium",
        })

    # ── Signal: micro-transaction ─────────────────────────────────────────────
    if amount < 1.0:
        signals.append({
            "type":     "low_amount",
            "label":    "Micro-transaction",
            "detail":   f"${amount:.4f} — possible subscription auth, test charge, or rounding",
            "severity": "low",
        })

    # ── Signal: unusual day-of-week (only if enough history) ──────────────────
    if len(df) >= 20:
        txn_dow   = int(df["day_of_week"].iloc[i])
        dow_frac  = len(df[df["day_of_week"] == txn_dow]) / len(df)
        if dow_frac < 0.05:
            day_names = ["Monday", "Tuesday", "Wednesday", "Thursday",
                         "Friday", "Saturday", "Sunday"]
            signals.append({
                "type":     "unusual_day",
                "label":    "Rare Day",
                "detail":   f"You almost never transact on {day_names[txn_dow]}s "
                            f"({dow_frac * 100:.0f}% of your history)",
                "severity": "low",
            })

    # ── Severity + risk ────────────────────────────────────────────────────────
    sev  = _severity(signals, z_score, percentile)
    risk = _risk_score(z_score, percentile)

    # ── Primary finding sentence ───────────────────────────────────────────────
    if signals:
        primary = signals[0]["detail"]
    elif z_score > 1:
        mult = round(amount / cat_mean, 1) if cat_mean > 0 else None
        primary = (f"${amount:.2f} is {mult}× the {cat_label} average"
                   if mult else f"${amount:.2f} deviates from your normal spending pattern")
    else:
        primary = "Unusual pattern detected by Isolation Forest based on timing and amount"

    return {
        "primary":           primary,
        "signals":           signals[:3],
        "risk_score":        risk,
        "z_score":           z_score,
        "category_avg":      round(cat_mean, 2),
        "category_std":      round(cat_std, 2),
        "amount_percentile": percentile,
        "severity":          sev,
    }


# ── Core detection ─────────────────────────────────────────────────────────────

def detect_anomalies(transactions: list[dict]) -> list[dict]:
    df = pd.DataFrame(transactions)

    df["date"]        = pd.to_datetime(df.get("date", pd.Timestamp.now()), errors="coerce")
    df["day_of_week"] = df["date"].dt.dayofweek.fillna(2).astype(int)
    df["hour"]        = df["date"].dt.hour.fillna(12).astype(int)
    df["amount"]      = pd.to_numeric(df.get("amount", 0), errors="coerce").fillna(0).abs()
    df["category"]    = df.get("category", "").fillna("").astype(str)
    df["description"] = df.get("description", "").fillna("").astype(str)

    if len(df) < 5:
        for txn in transactions:
            txn["is_anomaly"]     = False
            txn["anomaly_score"]  = 0.0
            txn["anomaly_reason"] = None
        return transactions

    features = df[["amount", "hour", "day_of_week"]].values
    X        = StandardScaler().fit_transform(features)

    model       = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
    predictions = model.fit_predict(X)
    scores      = model.score_samples(X)

    results = []
    for i, txn in enumerate(transactions):
        is_anomaly = bool(predictions[i] == -1)
        score      = round(float(scores[i]), 4)

        anomaly_reason = None
        if is_anomaly:
            details = compute_signals(
                i=i,
                df=df,
                amount=float(df["amount"].iloc[i]),
                category=str(df["category"].iloc[i]),
                description=str(df["description"].iloc[i]),
            )
            anomaly_reason = json.dumps(details)

        results.append({
            **txn,
            "is_anomaly":     is_anomaly,
            "anomaly_score":  score,
            "anomaly_reason": anomaly_reason,
        })

    return results


# ── Flask route ────────────────────────────────────────────────────────────────

@anomaly_bp.route("/anomaly", methods=["POST"])
def detect():
    data         = request.get_json()
    transactions = data.get("transactions", [])
    if not transactions:
        return jsonify({"error": "No transactions provided"}), 400

    t0      = time.time()
    results = detect_anomalies(transactions)
    flagged = sum(1 for r in results if r["is_anomaly"])
    ms      = round((time.time() - t0) * 1000)

    return jsonify({
        "results": results,
        "summary": {"total": len(results), "flagged": flagged},
        "timing":  {"total_ms": ms},
    })
