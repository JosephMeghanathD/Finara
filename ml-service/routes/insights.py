"""
Route: /api/ai/insights
Spending comparison over time + category trend insights.
"""

from flask import Blueprint, request, jsonify
from utils.gemma_client import ask_gemma_json

insights_bp = Blueprint("insights", __name__)


@insights_bp.route("/compare", methods=["POST"])
def compare_months():
    data   = request.get_json()
    months = data.get("months", [])

    if len(months) < 2:
        return jsonify({"error": "Provide at least 2 months to compare"}), 400

    rows = []
    for m in months:
        # Show only top 4 categories per month to keep prompt compact
        top_cats = sorted(m.get("categories", {}).items(), key=lambda x: x[1], reverse=True)[:4]
        cats = ", ".join(f"{k}=${v:.0f}" for k, v in top_cats)

        income  = m.get("income", 0)
        total   = m.get("total", 0)
        net     = m.get("net", income - total if income else None)

        fin_part = f"spent ${total:.0f}"
        if income:
            fin_part += f" | income ${income:.0f}"
        if net is not None:
            fin_part += f" | net ${net:+.0f}"

        rows.append(f"{m['month']}: {fin_part} | {cats}")

    table_text = "\n".join(rows)

    prompt = f"""Compare spending and income across months and identify key changes.

{table_text}

Reply JSON:
{{
  "insights": "2 sentences on major trends — reference both income and spending changes",
  "biggest_increase": {{"category": "...", "change_pct": 0}},
  "biggest_decrease": {{"category": "...", "change_pct": 0}},
  "overall_trend": "improving|worsening|stable"
}}"""

    result = ask_gemma_json(prompt, num_ctx=1024, num_predict=220)
    return jsonify({**result, "months": months})
