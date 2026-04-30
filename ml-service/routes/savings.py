"""
Route: /api/ai/savings
Gemma-powered savings plan generation and goal validation.
"""

import math
from flask import Blueprint, request, jsonify
from utils.gemma_client import ask_gemma_json

savings_bp = Blueprint("savings", __name__)

ADVISOR_SYSTEM = "You are Finara, a practical financial advisor. Give specific, number-based advice. Be direct and honest."


@savings_bp.route("/reality-check", methods=["POST"])
def reality_check():
    data          = request.get_json()
    goal_amount   = float(data.get("goal_amount", 0))
    timeframe     = int(data.get("timeframe_months", 3))
    income        = float(data.get("monthly_income", 0))
    spending_cats = data.get("monthly_spending", {})

    total_spend        = sum(spending_cats.values())
    monthly_surplus    = income - total_spend
    required_per_month = goal_amount / timeframe if timeframe > 0 else goal_amount
    is_realistic       = monthly_surplus >= required_per_month

    top_cats = sorted(spending_cats.items(), key=lambda x: x[1], reverse=True)[:6]
    cat_text = " | ".join(f"{k}: ${v:.0f}" for k, v in top_cats)

    # Compute all suggestion numbers in Python — Gemma must never touch numbers
    if is_realistic:
        suggested_months = None
        suggested_target = None
        needed_monthly_cut = None
    elif monthly_surplus > 0:
        # Surplus exists but not enough — suggest more time or lower target
        suggested_months   = max(3, math.ceil(goal_amount / monthly_surplus))
        suggested_target   = round(monthly_surplus * timeframe, 2)
        needed_monthly_cut = None
    else:
        # Spending exceeds income — tell them exactly what to cut
        suggested_months   = None
        suggested_target   = None
        needed_monthly_cut = round(abs(monthly_surplus) + required_per_month, 2)

    if is_realistic:
        advice_context = f"They have ${monthly_surplus:.0f}/mo surplus, which covers the ${required_per_month:.0f}/mo needed."
    elif monthly_surplus > 0:
        advice_context = (f"They only have ${monthly_surplus:.0f}/mo surplus but need ${required_per_month:.0f}/mo. "
                          f"To hit the goal they need {suggested_months} months, or they can save ${suggested_target:.0f} in {timeframe} months instead.")
    else:
        advice_context = (f"They're spending ${abs(monthly_surplus):.0f}/mo more than they earn. "
                          f"They must cut ${needed_monthly_cut:.0f}/mo total to both break even and save for this goal.")

    prompt = f"""Give practical, encouraging advice for this savings goal. Do NOT repeat the numbers — focus on what action to take.

Goal: ${goal_amount:.0f} in {timeframe} month(s)
{advice_context}
Top spending: {cat_text}

Write 2 sentences: one on the core challenge, one specific actionable tip (name a real category to cut).
Reply JSON only:
{{
  "analysis": "...",
  "biggest_opportunity": "category name"
}}"""

    result = ask_gemma_json(prompt, system=ADVISOR_SYSTEM, num_ctx=1024, num_predict=180)
    result["is_realistic"]       = is_realistic
    result["suggested_months"]   = suggested_months
    result["suggested_target"]   = suggested_target
    result["needed_monthly_cut"] = needed_monthly_cut
    return jsonify(result)


FIXED_COSTS = {"rent & housing", "rent", "housing", "utilities", "mortgage"}
ESSENTIAL_COSTS = {"groceries", "healthcare", "insurance", "personal care"}

def _min_floor(category: str, current: float) -> float:
    key = category.lower()
    if any(f in key for f in FIXED_COSTS):
        return current          # never cut fixed costs
    if any(e in key for e in ESSENTIAL_COSTS):
        return round(current * 0.80, 2)   # max 20% cut on essentials
    return round(current * 0.40, 2)       # discretionary: up to 60% cut


@savings_bp.route("/plan", methods=["POST"])
def create_savings_plan():
    data          = request.get_json()
    goal_amount   = float(data.get("goal_amount", 0))
    timeframe     = int(data.get("timeframe_months", 3))
    income        = float(data.get("monthly_income", 0))
    spending_cats = data.get("monthly_spending", {})

    required_per_month = goal_amount / timeframe if timeframe > 0 else goal_amount
    total_spend        = sum(spending_cats.values())
    monthly_surplus    = income - total_spend

    # Separate fixed from discretionary — Gemma should only cut discretionary
    discretionary = {k: v for k, v in spending_cats.items()
                     if not any(f in k.lower() for f in FIXED_COSTS)}
    all_disc = sorted(discretionary.items(), key=lambda x: x[1], reverse=True)
    cat_text = "\n".join(f"- {k}: ${v:.0f}/mo" for k, v in all_disc)

    prompt = f"""Create a realistic savings plan: ${goal_amount:.0f} in {timeframe} month(s).

Income: ${income:.0f}/mo | Spending: ${total_spend:.0f}/mo | Need to save: ${required_per_month:.0f}/mo
All discretionary categories:
{cat_text}

Rules:
- Suggest a target_monthly for EVERY category listed above
- NEVER set target_monthly to 0 or below
- Keep cuts realistic: at most 50-60% reduction per category
- Give one specific practical tip per category

Reply JSON:
{{
  "plan": "2-3 sentence summary of the overall strategy",
  "cuts": [
    {{
      "category": "exact category name from the list",
      "current_monthly": 0,
      "target_monthly": 0,
      "monthly_savings": 0,
      "tip": "one specific action"
    }}
  ],
  "total_monthly_savings": 0,
  "on_track": true
}}"""

    try:
        result = ask_gemma_json(prompt, system=ADVISOR_SYSTEM, num_ctx=1536, num_predict=600)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Enforce floors — override any nonsense Gemma returns
    seen_cats = set()
    if isinstance(result.get("cuts"), list):
        for cut in result["cuts"]:
            cat     = cut.get("category", "")
            current = float(cut.get("current_monthly") or spending_cats.get(cat, 0))
            floor   = _min_floor(cat, current)
            target  = float(cut.get("target_monthly") or 0)
            target  = max(target, floor)
            cut["current_monthly"] = round(current, 2)
            cut["target_monthly"]  = round(target, 2)
            cut["monthly_savings"] = round(max(0, current - target), 2)
            seen_cats.add(cat)

        # Add any discretionary categories Gemma missed
        for cat, amount in all_disc:
            if cat not in seen_cats:
                result["cuts"].append({
                    "category":        cat,
                    "current_monthly": round(amount, 2),
                    "target_monthly":  round(amount, 2),
                    "monthly_savings": 0,
                    "tip":             "Maintain current spending",
                })

        result["total_monthly_savings"] = round(
            sum(c["monthly_savings"] for c in result["cuts"]), 2)

    # Build all_budgets: fixed costs at current + discretionary at targets
    all_budgets = {}
    for cat, amount in spending_cats.items():
        all_budgets[cat] = round(amount, 2)
    for cut in result.get("cuts", []):
        cat = cut.get("category", "")
        if cat:
            all_budgets[cat] = cut["target_monthly"]
    result["all_budgets"] = all_budgets

    return jsonify(result)


@savings_bp.route("/budget-vs-actual", methods=["POST"])
def budget_vs_actual():
    data   = request.get_json()
    budget = data.get("budget", {})
    actual = data.get("actual", {})
    month  = data.get("month", "this month")
    income = float(data.get("income", 0))

    rows         = []
    over_budget  = []
    under_budget = []

    all_cats = set(list(budget.keys()) + list(actual.keys()))
    for cat in all_cats:
        b    = budget.get(cat, 0)
        a    = actual.get(cat, 0)
        diff = a - b
        pct  = ((diff / b) * 100) if b > 0 else 0
        rows.append(f"{cat}: budgeted ${b:.0f}, spent ${a:.0f} ({pct:+.0f}%)")
        if diff > 0:
            over_budget.append({"category": cat, "over_by": round(diff, 2)})
        elif diff < 0:
            under_budget.append({"category": cat, "saved": round(abs(diff), 2)})

    table_text = "\n".join(rows)
    total_actual  = sum(actual.values())
    total_budgeted = sum(budget.values())

    # Build income/net header so Gemma has full ledger context
    ledger_line = ""
    if income:
        net = income - total_actual
        ledger_line = (f"Income: ${income:.0f} | Total spent: ${total_actual:.0f} "
                       f"| Net: ${net:+.0f} | Budgeted: ${total_budgeted:.0f}\n")

    prompt = f"""Budget vs actual for {month}:
{ledger_line}{table_text}

Write a 2-sentence summary. Reference income and net cash flow if available. Acknowledge wins, flag overruns directly.
Reply JSON: {{"analysis": "..."}}"""

    result = ask_gemma_json(prompt, system=ADVISOR_SYSTEM, num_ctx=768, num_predict=160)
    return jsonify({
        **result,
        "over_budget":  over_budget,
        "under_budget": under_budget,
        "breakdown":    [{"category": cat,
                          "budget":   budget.get(cat, 0),
                          "actual":   actual.get(cat, 0)}
                         for cat in all_cats]
    })
