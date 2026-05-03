"""
Route: /api/ai/narrative
Gemma-powered financial storytelling + Q&A + merchant explainer.
"""

import re
import time
from flask import Blueprint, request, jsonify
from utils.gemma_client import ask_gemma, ask_gemma_json, ask_gemma_chat

narrative_bp = Blueprint("narrative", __name__)

NARRATOR_SYSTEM = """You are Finara, a personal finance AI. Be concise, cite exact numbers, and always end with one actionable next step.

When the user asks for a chart, graph, or visualization, describe the data in plain text — Finara will automatically render the chart in the UI. Never suggest external tools like Excel, Google Sheets, or online chart generators."""

_STORY_EXAMPLE = """
EXAMPLE (do not copy these numbers — write the real story using the data below):
Input: Income $4,200 | Spent $2,840 | Net $1,360 surplus. Top: Dining $680, Groceries $420, Rent $1,100. Anomaly: AMZN $312.
Expected output:
March was a balanced month — you brought in $4,200 and spent $2,840, leaving a healthy $1,360 surplus. Whether that surplus is being invested or just sitting is the key question to ask yourself.

Dining at $680 is your biggest discretionary line, nearly 24% of total spend. Combined with $420 in groceries, food accounts for over $1,100 — meal prep could shift some of that dining spend to groceries at a fraction of the cost.

A $312 Amazon charge stands out; verify it wasn't a subscription renewal you forgot. Groceries are forecast to tick up next month, so setting a $400 ceiling there would be wise. You consistently earn more than you spend — keep that surplus intentional.
"""

_ANOMALY_EXAMPLE = """
EXAMPLE (do not copy — explain the REAL transaction below):
Input: "NETFLIX" $54.99 | Entertainment | Avg: $15 | ML reason: 3x above category average.
Expected: This Netflix charge is $40 above your usual $15 entertainment spend, which typically covers one streaming service — this looks like a plan upgrade or a duplicate charge. Log into your Netflix account to confirm your current plan tier and whether you were billed twice this month.
"""

# In-process cache for merchant explanations — same name always yields same result
_merchant_cache: dict = {}

_CHART_KEYWORDS = [
    "pie chart", "bar chart", "bar graph", "line chart", "line graph",
    "breakdown", "spending chart", "chart here", "visualize", "visualization",
    "show me", "spending by category", "by category", "category breakdown",
    "trend", "over time", "over months", "month by month", "monthly trend",
]
_PLACEHOLDER_RE = re.compile(
    r'\[(?:Imagine |Here is |Here\'s )?(?:a |an |your )?(?:pie|bar|line|spending|financial|category)[\w\s]*chart[^\]]*\]',
    re.IGNORECASE,
)
# Strips chart-config boilerplate Gemma generates when it thinks it can't render charts
_CHART_BOILERPLATE_RE = re.compile(
    r'(\*{0,2}(?:Chart Type|Graph Type|X-Axis|Y-Axis|Z-Axis|Bars?|Data Points?|Legend|Title|Series)\s*:\**.*\n?'
    r'|\(Note:[^)]*(?:cannot|can\'t|unable)[^)]*(?:render|display|show|creat)[^)]*\)\n?'
    r'|\*{0,2}Note:\*{0,2}\s*[^\n]*(?:cannot|can\'t|unable)[^\n]*(?:render|display|show|creat)[^\n]*\n?)',
    re.IGNORECASE,
)
_LINE_KEYWORDS  = ["line chart", "line graph", "in line", "as line", "as a line", "trend", "over time", "over months", "month by month", "monthly trend"]
_BAR_KEYWORDS   = ["bar chart", "bar graph"]

def _extract_chart(reply: str, context: dict, user_message: str = "") -> tuple[str, dict | None]:
    """Strip chart placeholders from reply and build real chart data if intent detected."""
    combined = (reply + " " + user_message).lower()
    has_intent = any(kw in combined for kw in _CHART_KEYWORDS)

    if not has_intent:
        return reply, None

    clean_reply = _PLACEHOLDER_RE.sub("", reply).strip()
    clean_reply = _CHART_BOILERPLATE_RE.sub("", clean_reply).strip()
    clean_reply = re.sub(r'\n{3,}', '\n\n', clean_reply)

    # Line / trend chart — needs monthly_history
    if any(kw in combined for kw in _LINE_KEYWORDS):
        monthly_history = context.get("monthly_history", [])
        if monthly_history:
            wants_income = any(kw in combined for kw in ["income", "earning", "salary", "vs income", "and income"])
            data = [
                {k: v for k, v in entry.items() if k != "income" or wants_income}
                for entry in monthly_history
            ]
            chart = {"type": "line", "title": "Monthly Spending Trend", "data": data}
            return clean_reply, chart
        # Fall through to bar if no history available

    # Bar or pie — both need categories
    categories = context.get("categories", {})
    if not categories:
        return reply, None

    data = [
        {"name": k, "value": round(v, 2)}
        for k, v in sorted(categories.items(), key=lambda x: x[1], reverse=True)
        if v > 0
    ]
    if not data:
        return reply, None

    chart_type = "bar" if any(kw in combined for kw in _BAR_KEYWORDS) else "pie"
    chart = {"type": chart_type, "title": "Spending Breakdown", "data": data}
    return clean_reply, chart


@narrative_bp.route("/story", methods=["POST"])
def generate_story():
    data            = request.get_json()
    month           = data.get("month", "this month")
    summary         = data.get("summary", {})
    history_context = data.get("history_context", "").strip()

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

    history_block = f"\n{history_context}\n" if history_context else ""

    prompt = f"""Write a 3-paragraph financial story for {month}.
{history_block}{_STORY_EXAMPLE}
NOW WRITE THE REAL STORY USING THIS DATA:
{fin_header}
Spending breakdown: {cat_text}
Flagged transactions: {anom_text}
Forecast next month: {forecast_text}

Para 1: Overall month — income vs spending, cash flow result. Reference trend from history if available.
Para 2: Top spending areas and what they reveal about habits, compared to 6-month averages if available.
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
{_ANOMALY_EXAMPLE}
NOW EXPLAIN THIS REAL TRANSACTION:
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

    history_context = data.get("history_context", "").strip()

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

    ctx_text      = " | ".join(ctx_parts) if ctx_parts else "No financial data loaded"
    history_block = f"\n{history_context}" if history_context else ""

    messages = [{
        "role":    "system",
        "content": NARRATOR_SYSTEM + f"\n\nUser's data: {ctx_text}{history_block}"
    }]
    for h in history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    t0 = time.time()
    reply = ask_gemma_chat(messages, temperature=0.7, num_ctx=2048, num_predict=600)
    gemma_ms = round((time.time() - t0) * 1000)

    clean_reply, chart = _extract_chart(reply, context, message)
    return jsonify({
        "reply":  clean_reply,
        "chart":  chart,
        "timing": {"gemma_ms": gemma_ms, "total_ms": gemma_ms},
    })


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

    prompt = f"""Give 5 specific, actionable money tips based on this week's spending.

{fin_header}
{cat_text}

Rules:
- Each tip must mention a specific dollar amount from the data above.
- For each tip assign: category (Reduce, Save, Habit, Goal, or Warning), impact (high, medium, or low), and a how_to action step (one short sentence, max 12 words).

Reply only with JSON in this exact format:
{{"tips": [{{"text": "tip text", "category": "Reduce", "impact": "high", "how_to": "Set a $X weekly limit for this category."}}, ...]}}"""

    t0 = time.time()
    result = ask_gemma_json(prompt, num_ctx=1024, num_predict=650)
    gemma_ms = round((time.time() - t0) * 1000)

    # Normalize: handle both old string format and new object format
    raw_tips = result.get("tips", [])
    normalized = []
    for tip in raw_tips:
        if isinstance(tip, str):
            normalized.append({"text": tip, "category": "Tip", "impact": "medium", "how_to": ""})
        elif isinstance(tip, dict):
            normalized.append({
                "text":     tip.get("text", str(tip)),
                "category": tip.get("category", "Tip"),
                "impact":   tip.get("impact", "medium"),
                "how_to":   tip.get("how_to", ""),
            })
    result["tips"] = normalized

    result["timing"] = {"gemma_ms": gemma_ms, "total_ms": gemma_ms}
    return jsonify(result)
