"""
Route: /api/ml/anomaly
Isolation Forest anomaly detection on transaction amounts + time patterns.
"""

import time
from flask import Blueprint, request, jsonify
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

anomaly_bp = Blueprint("anomaly", __name__)


def detect_anomalies(transactions: list[dict]) -> list[dict]:
    """
    Runs Isolation Forest on transaction features.
    Features: amount, hour_of_day, day_of_week, category_encoded
    """
    df = pd.DataFrame(transactions)

    # Parse date features
    df["date"] = pd.to_datetime(df.get("date", pd.Timestamp.now()), errors="coerce")
    df["hour"]       = df["date"].dt.hour.fillna(12)
    df["day_of_week"] = df["date"].dt.dayofweek.fillna(2)
    df["amount"]     = pd.to_numeric(df.get("amount", 0), errors="coerce").fillna(0).abs()

    # Need at least 5 transactions to run the model
    if len(df) < 5:
        for txn in transactions:
            txn["is_anomaly"]    = False
            txn["anomaly_score"] = 0.0
            txn["anomaly_reason"] = None
        return transactions

    features = df[["amount", "hour", "day_of_week"]].values
    scaler   = StandardScaler()
    X        = scaler.fit_transform(features)

    model = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
    predictions  = model.fit_predict(X)         # -1 = anomaly, 1 = normal
    scores       = model.score_samples(X)       # more negative = more anomalous

    results = []
    for i, txn in enumerate(transactions):
        is_anomaly = bool(predictions[i] == -1)
        score      = round(float(scores[i]), 4)

        reason = None
        if is_anomaly:
            mean_amount = df["amount"].mean()
            std_amount  = df["amount"].std()
            amt         = df["amount"].iloc[i]
            if amt > mean_amount + 2 * std_amount:
                reason = f"Amount ${amt:.2f} is significantly higher than your usual spending (avg ${mean_amount:.2f})"
            elif amt < 1.0:
                reason = "Very small transaction — possible subscription fee or test charge"
            else:
                reason = "Unusual pattern based on timing or spending behavior"

        results.append({
            **txn,
            "is_anomaly":    is_anomaly,
            "anomaly_score": score,
            "anomaly_reason": reason,
        })

    return results


@anomaly_bp.route("/anomaly", methods=["POST"])
def detect():
    """
    Input:  { "transactions": [{id, description, amount, date, category}, ...] }
    Output: { "results": [{...txn, is_anomaly, anomaly_score, anomaly_reason}, ...] }
    """
    data = request.get_json()
    transactions = data.get("transactions", [])

    if not transactions:
        return jsonify({"error": "No transactions provided"}), 400

    t0 = time.time()
    results = detect_anomalies(transactions)
    flagged = sum(1 for r in results if r["is_anomaly"])
    total_ms = round((time.time() - t0) * 1000)

    return jsonify({
        "results": results,
        "summary": {
            "total":   len(results),
            "flagged": flagged,
        },
        "timing": {"total_ms": total_ms},
    })
