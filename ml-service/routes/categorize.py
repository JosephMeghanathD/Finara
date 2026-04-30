"""
Route: /api/ml/categorize
ML model that classifies transactions into spending categories.
Uses a TF-IDF + Logistic Regression pipeline trained on merchant names.
"""

from flask import Blueprint, request, jsonify
import pandas as pd
import pickle
import os
from utils.categorizer import get_categorizer

categorize_bp = Blueprint("categorize", __name__)


@categorize_bp.route("/categorize", methods=["POST"])
def categorize_transactions():
    """
    Input:  { "transactions": [{"id": 1, "description": "STARBUCKS #1234", "amount": 5.75}, ...] }
    Output: { "results": [{"id": 1, "category": "Food & Drink", "confidence": 0.92}, ...] }
    """
    data = request.get_json()
    transactions = data.get("transactions", [])

    if not transactions:
        return jsonify({"error": "No transactions provided"}), 400

    model = get_categorizer()
    results = []

    for txn in transactions:
        desc = txn.get("description", "")
        amount = txn.get("amount", 0)
        category, confidence = model.predict(desc, amount)
        results.append({
            "id": txn.get("id"),
            "category": category,
            "confidence": round(confidence, 3)
        })

    return jsonify({"results": results})
