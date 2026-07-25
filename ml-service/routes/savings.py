"""
Route: /api/ai/savings
Gemma-powered savings plan generation and goal validation.
"""

import math
import time
from flask import Blueprint, request, jsonify
from utils.gemma_client import ask_gemma_json

savings_bp = Blueprint("savings", __name__)

ADVISOR_SYSTEM = "You are Finara, a practical financial advisor. Always name the specific category to cut and by how much. Never give vague advice like 'reduce discretionary spending'."

_REALITY_CHECK_EXAMPLE = """
EXAMPLE (do not copy these numbers):
Input: Goal $1,500 in 3 months. Income $3,800, spending $3,400, surplus $400/mo. Need $500/mo. Top: Dining $620, Subscriptions $90.
Expected JSON: {"analysis": "Your $400 monthly surplus falls $100 short of the $500/month needed, which is a manageable gap. Cutting $120 from dining — about one fewer restaurant meal per week — closes it with room to spare.", "biggest_opportunity": "Dining"}
"""

_SAVINGS_PLAN_EXAMPLE = """
EXAMPLE (do not copy these numbers — use real data below):
Input: Goal $2,400 in 4 months = $600/mo. Surplus $400. Discretionary: Dining $550, Entertainment $180.
Expected JSON (abbreviated):
{"plan": "You need $200/month beyond your current $400 surplus. Dining is your biggest lever.", "cuts": [{"category": "Dining", "current_monthly": 550, "target_monthly": 350, "monthly_savings": 200, "tip": "Cook dinner 4 nights a week — batch-prep on Sundays."}], "total_monthly_savings": 200, "on_track": true}
"""


@savings_bp.route("/reality-check", methods=["POST"])
def reality_check():
    data            = request.get_json()
    goal_amount     = float(data.get("goal_amount", 0))
    timeframe       = int(data.get("timeframe_months", 3))
    income          = float(data.get("monthly_income", 0))
    spending_cats   = data.get("monthly_spending", {})
    history_context = data.get("history_context", "").strip()

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
        suggested_target   = round(monthly_surplus * timeframe)
        needed_monthly_cut = None
    else:
        # Spending exceeds income — tell them exactly what to cut
        suggested_months   = None
        suggested_target   = None
        needed_monthly_cut = round(abs(monthly_surplus) + required_per_month)

    if is_realistic:
        advice_context = f"They have ${monthly_surplus:.0f}/mo surplus, which covers the ${required_per_month:.0f}/mo needed."
    elif monthly_surplus > 0:
        advice_context = (f"They only have ${monthly_surplus:.0f}/mo surplus but need ${required_per_month:.0f}/mo. "
                          f"To hit the goal they need {suggested_months} months, or they can save ${suggested_target:.0f} in {timeframe} months instead.")
    else:
        advice_context = (f"They're spending ${abs(monthly_surplus):.0f}/mo more than they earn. "
                          f"They must cut ${needed_monthly_cut:.0f}/mo total to both break even and save for this goal.")

    ledger = (f"Monthly income (credit): ${income:.0f} | "
              f"Typical monthly spending (debit, excl. one-offs): ${total_spend:.0f} | "
              f"Net: ${monthly_surplus:+.0f}")

    history_block = f"{history_context}\n\n" if history_context else ""

    prompt = f"""Give practical, encouraging advice for this savings goal. Do NOT repeat the numbers — focus on what action to take.
{_REALITY_CHECK_EXAMPLE}
NOW ADVISE ON THIS REAL GOAL:
{history_block}Goal: ${goal_amount:.0f} in {timeframe} month(s)
Finances: {ledger}
{advice_context}
Top typical spending categories: {cat_text}

Write 2 sentences: one on the core challenge, one specific actionable tip (name a real category to cut).
Reply JSON only:
{{
  "analysis": "...",
  "biggest_opportunity": "category name"
}}"""

    t0 = time.time()
    result = ask_gemma_json(prompt, system=ADVISOR_SYSTEM, num_ctx=1024, num_predict=180)
    gemma_ms = round((time.time() - t0) * 1000)
    result["is_realistic"]       = is_realistic
    result["suggested_months"]   = suggested_months
    result["suggested_target"]   = suggested_target
    result["needed_monthly_cut"] = needed_monthly_cut
    result["timing"]             = {"gemma_ms": gemma_ms, "total_ms": gemma_ms}
    return jsonify(result)


FIXED_COSTS = {"rent & housing", "rent", "housing", "utilities", "mortgage"}
ESSENTIAL_COSTS = {"groceries", "healthcare", "insurance", "personal care"}

# The plan prompt demands one full cut object per category, so the reply grows
# with the category count. A fixed token budget truncates the JSON mid-array as
# soon as a user has more than a handful of categories (Gemini stops with
# finishReason=MAX_TOKENS and the reply is unparseable), so both the number of
# categories sent and the token budget are bounded/scaled instead.
MAX_PROMPT_CATEGORIES = 12
_TOKENS_PER_CUT       = 90    # measured ~65; padded for long category names/tips
_TOKENS_PLAN_OVERHEAD = 400   # "plan" prose + envelope keys

def _min_floor(category: str, current: float) -> float:
    key = category.lower()
    if any(f in key for f in FIXED_COSTS):
        return current          # never cut fixed costs
    if any(e in key for e in ESSENTIAL_COSTS):
        return round(current * 0.80, 2)   # max 20% cut on essentials
    return round(current * 0.40, 2)       # discretionary: up to 60% cut


@savings_bp.route("/plan", methods=["POST"])
def create_savings_plan():
    data            = request.get_json()
    goal_amount     = float(data.get("goal_amount", 0))
    timeframe       = int(data.get("timeframe_months", 3))
    income          = float(data.get("monthly_income", 0))
    spending_cats   = data.get("monthly_spending", {})
    history_context = data.get("history_context", "").strip()

    required_per_month = goal_amount / timeframe if timeframe > 0 else goal_amount
    total_spend        = sum(spending_cats.values())
    monthly_surplus    = income - total_spend

    # Separate fixed from discretionary — Gemma should only cut discretionary
    discretionary = {k: v for k, v in spending_cats.items()
                     if not any(f in k.lower() for f in FIXED_COSTS)}
    all_disc = sorted(discretionary.items(), key=lambda x: x[1], reverse=True)

    # Only the biggest categories are worth the model's tokens — the tail is
    # back-filled below at current spend. Bounding this bounds the output size.
    prompt_disc = all_disc[:MAX_PROMPT_CATEGORIES]
    cat_text = "\n".join(f"- {k}: ${v:.0f}/mo" for k, v in prompt_disc)

    surplus_label = "surplus" if monthly_surplus >= 0 else "deficit"
    history_block = f"{history_context}\n\n" if history_context else ""

    prompt = f"""Create a realistic savings plan: ${goal_amount:.0f} in {timeframe} month(s).
{_SAVINGS_PLAN_EXAMPLE}
NOW CREATE THE REAL PLAN:
{history_block}Monthly income (credit): ${income:.0f} | Typical monthly spending (debit, excl. one-offs): ${total_spend:.0f} | Net {surplus_label}: ${abs(monthly_surplus):.0f} | Need to save: ${required_per_month:.0f}/mo
All typical discretionary spending categories:
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

    # Scale the reply budget with the number of cuts requested. On Ollama num_ctx
    # is the *whole* window (prompt + reply), so it has to cover both or the
    # prompt gets silently trimmed.
    num_predict = _TOKENS_PLAN_OVERHEAD + _TOKENS_PER_CUT * len(prompt_disc)
    num_ctx     = max(1536, len(prompt) // 4 + num_predict + 256)

    try:
        t0 = time.time()
        result = ask_gemma_json(prompt, system=ADVISOR_SYSTEM,
                                num_ctx=num_ctx, num_predict=num_predict)
        gemma_ms = round((time.time() - t0) * 1000)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Enforce floors — override any nonsense Gemma returns
    seen_cats = set()
    if isinstance(result.get("cuts"), list):
        # A salvaged truncated reply can end in a half-written cut; a nameless one
        # carries no information and would render as a blank $0 row. The back-fill
        # below re-adds the category at current spend.
        result["cuts"] = [c for c in result["cuts"]
                          if isinstance(c, dict) and str(c.get("category", "")).strip()]
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
    result["timing"]      = {"gemma_ms": gemma_ms, "total_ms": gemma_ms}

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

    t0 = time.time()
    result = ask_gemma_json(prompt, system=ADVISOR_SYSTEM, num_ctx=768, num_predict=160)
    gemma_ms = round((time.time() - t0) * 1000)
    return jsonify({
        **result,
        "over_budget":  over_budget,
        "under_budget": under_budget,
        "breakdown":    [{"category": cat,
                          "budget":   budget.get(cat, 0),
                          "actual":   actual.get(cat, 0)}
                         for cat in all_cats],
        "timing":       {"gemma_ms": gemma_ms, "total_ms": gemma_ms},
    })
