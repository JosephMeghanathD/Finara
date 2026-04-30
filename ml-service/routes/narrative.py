"""
Route: /api/ai/narrative
Gemma-powered financial storytelling + Q&A + merchant explainer.
"""

import re
import time
from flask import Blueprint, request, jsonify
from utils.gemma_client import ask_gemma, ask_gemma_json, ask_gemma_chat

narrative_bp = Blueprint("narrative", __name__)

NARRATOR_SYSTEM = """You are Finara, a concise personal finance AI advisor built into the Finara app.

Finara features you can explain to users:
- Dashboard: spending overview, category breakdown, net cash flow, recent transactions
- Transactions: full list with search/filter, anomaly flags, merchant identification (ℹ button)
- Monthly Story: AI-generated narrative of your spending for any month or date range
- Anomaly Detection: ML-flagged unusual transactions with "Ask why?" explanations
- Spending Forecast: ML prediction for next month spend by category
- Budget vs Actual: set monthly category budgets and track against real spending
- Savings Planner: savings goal reality check + actionable month-by-month savings plan
- Compare Months: side-by-side spending comparison across multiple months with trend analysis
- Weekly Coach: 3 personalized, data-driven spending tips based on the current week
- Chat (here): ask any question about your finances — Finara has full context of your transactions

Use plain English. Cite exact numbers from the user's data. Be honest and encouraging."""

# In-process cache for merchant explanations — same name always yields same result
_merchant_cache: dict = {}

_CHART_KEYWORDS = ["pie chart", "bar chart", "breakdown", "spending chart", "chart here", "visualize", "visualization"]
_PLACEHOLDER_RE = re.compile(
    r'\[(?:Imagine |Here is |Here\'s )?(?:a |an |your )?(?:pie|bar|spending|financial|category)[\w\s]*chart[^\]]*\]',
    re.IGNORECASE,
)

def _extract_chart(reply: str, context: dict) -> tuple[str, dict | None]:
    """Strip chart placeholders from reply and build real chart data if intent detected."""
    reply_lower = reply.lower()
    has_intent = any(kw in reply_lower for kw in _CHART_KEYWORDS)
    categories = context.get("categories", {})

    if not has_intent or not categories:
        return reply, None

    clean_reply = _PLACEHOLDER_RE.sub("", reply).strip()
    # Collapse any double newlines left by removal
    clean_reply = re.sub(r'\n{3,}', '\n\n', clean_reply)

    data = [
        {"name": k, "value": round(v, 2)}
        for k, v in sorted(categories.items(), key=lambda x: x[1], reverse=True)
        if v > 0
    ]
    if not data:
        return reply, None

    chart = {"type": "pie", "title": "Spending Breakdown", "data": data}
    return clean_reply, chart


@narrative_bp.route("/story", methods=["POST"])
def generate_story():
    data    = request.get_json()
    month   = data.get("month", "this month")
    summary = data.get("summary", {})

    categories = summary.get("categories", {})
    anomalies  = summary.get("anomalies", [])
    total      = summary.get("total_spent", 0)
    forecasts  = summary.get("forecasts", {})
    income     = summary.get("income", None)

    top_cats = sorted(categories.items(), key=lambda x: x[1], reverse=True)[:6]
    cat_text = " | ".join(f"{k}: ${v:.0f}" for k, v in top_cats)

    anom_text = "; ".join(
        f"{a.get('description','?')} ${a.get('amount',0):.0f}"
        for a in anomalies[:3]
    ) if anomalies else "none"

    forecast_text = " | ".join(
        f"{k}: ${v['forecast'][0]:.0f}" for k, v in list(forecasts.items())[:4] if k != "_total"
    ) if forecasts else "N/A"

    net_cash_flow       = summary.get("net_cash_flow")
    savings_transferred = summary.get("savings_transferred", 0)

    # Build a compact financial header with both sides of the ledger
    fin_lines = []
    if income:
        fin_lines.append(f"Income: ${income:.0f}")
    fin_lines.append(f"Total spent: ${total:.0f}")
    if savings_transferred:
        fin_lines.append(f"Transferred to savings: ${savings_transferred:.0f}")
    if net_cash_flow is not None:
        direction = "surplus" if net_cash_flow >= 0 else "deficit"
        fin_lines.append(f"Net cash flow: ${abs(net_cash_flow):.0f} {direction}")
    fin_header = " | ".join(fin_lines)

    prompt = f"""Write a 3-paragraph financial story for {month}.

{fin_header}
Spending breakdown: {cat_text}
Flagged transactions: {anom_text}
Forecast next month: {forecast_text}

Para 1: Overall month — income vs spending, cash flow result.
Para 2: Top spending areas and what they reveal about habits.
Para 3: Unusual activity and one forward-looking insight. End with one encouraging sentence.

Be specific, use the exact numbers above."""

    t0 = time.time()
    story = ask_gemma(prompt, system=NARRATOR_SYSTEM, temperature=0.65,
                      num_ctx=1536, num_predict=450)
    gemma_ms = round((time.time() - t0) * 1000)

    return jsonify({"story": story, "timing": {"gemma_ms": gemma_ms, "total_ms": gemma_ms}})


@narrative_bp.route("/explain-anomaly", methods=["POST"])
def explain_anomaly():
    data    = request.get_json()
    txn     = data.get("transaction", {})
    context = data.get("user_context", {})
    avg     = context.get("avg_category_spend", "unknown")

    prompt = f"""Explain in 2 sentences why this transaction was flagged as unusual.

"{txn.get('description', '?')}" | ${txn.get('amount', 0):.2f} | {txn.get('category', '?')} | {txn.get('date', '?')}
ML reason: {txn.get('anomaly_reason', 'unusual pattern')}
Your average in this category: ${avg}

Be specific and friendly. Tell them what to check."""

    t0 = time.time()
    explanation = ask_gemma(prompt, system=NARRATOR_SYSTEM, temperature=0.4,
                            num_ctx=768, num_predict=180)
    gemma_ms = round((time.time() - t0) * 1000)

    return jsonify({"explanation": explanation, "timing": {"gemma_ms": gemma_ms, "total_ms": gemma_ms}})


@narrative_bp.route("/explain-merchant", methods=["POST"])
def explain_merchant():
    data     = request.get_json()
    merchant = data.get("merchant_name", "").strip()

    if merchant in _merchant_cache:
        return jsonify(_merchant_cache[merchant])

    prompt = f"""What is "{merchant}" on a bank statement?
Reply JSON: {{"explanation": "one sentence what this charge is", "likely_category": "category name"}}"""

    t0 = time.time()
    result = ask_gemma_json(prompt, num_ctx=512, num_predict=120)
    gemma_ms = round((time.time() - t0) * 1000)

    result["timing"] = {"gemma_ms": gemma_ms, "total_ms": gemma_ms}
    _merchant_cache[merchant] = result
    return jsonify(result)


@narrative_bp.route("/chat", methods=["POST"])
def chat():
    data    = request.get_json()
    message = data.get("message", "")
    context = data.get("context", {})
    history = data.get("history", [])

    ctx_parts = []
    if context.get("income"):
        ctx_parts.append(f"Income: ${context['income']:.0f}")
    if context.get("total_spent"):
        ctx_parts.append(f"Spent: ${context['total_spent']:.0f}")
    if context.get("savings_transferred"):
        ctx_parts.append(f"To savings: ${context['savings_transferred']:.0f}")
    if context.get("net_cash_flow") is not None:
        ncf = context["net_cash_flow"]
        ctx_parts.append(f"Net cash flow: ${ncf:+.0f}")
    if context.get("categories"):
        top = sorted(context["categories"].items(), key=lambda x: x[1], reverse=True)[:5]
        ctx_parts.append("Top spend: " + ", ".join(f"{k}=${v:.0f}" for k, v in top))

    ctx_text = " | ".join(ctx_parts) if ctx_parts else "No financial data loaded"

    messages = [{
        "role":    "system",
        "content": NARRATOR_SYSTEM + f"\n\nUser's data: {ctx_text}"
    }]
    for h in history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    t0 = time.time()
    reply = ask_gemma_chat(messages, temperature=0.7, num_ctx=2048, num_predict=400)
    gemma_ms = round((time.time() - t0) * 1000)
    return jsonify({"reply": reply, "timing": {"gemma_ms": gemma_ms, "total_ms": gemma_ms}})


@narrative_bp.route("/coach", methods=["POST"])
def spending_coach():
    data        = request.get_json()
    weekly_data = data.get("weekly_data", {})

    categories = weekly_data.get("categories", {})
    total      = weekly_data.get("total", 0)
    vs_avg     = weekly_data.get("compared_to_avg", 0)

    income    = weekly_data.get("income", 0)
    top_cats  = sorted(categories.items(), key=lambda x: x[1], reverse=True)[:5]
    cat_text  = "\n".join(f"- {k}: ${v:.0f}" for k, v in top_cats)
    direction = "above" if vs_avg > 0 else "below"

    # Build header with both income and spending
    header_parts = [f"Total spent: ${total:.0f} ({abs(vs_avg):.0f}% {direction} your average week)"]
    if income:
        net = income - total
        header_parts.append(f"Income received: ${income:.0f} | Net this week: ${net:+.0f}")
    fin_header = "\n".join(header_parts)

    prompt = f"""Give 3 specific, actionable money tips based on this week's spending.

{fin_header}
{cat_text}

Each tip must mention a specific dollar amount from the data above.
Reply JSON: {{"tips": ["tip1", "tip2", "tip3"]}}"""

    t0 = time.time()
    result = ask_gemma_json(prompt, num_ctx=768, num_predict=240)
    gemma_ms = round((time.time() - t0) * 1000)

    result["timing"] = {"gemma_ms": gemma_ms, "total_ms": gemma_ms}
    return jsonify(result)
