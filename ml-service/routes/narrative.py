"""
Route: /api/ai/narrative
Gemma-powered financial storytelling + Q&A + merchant explainer.
"""

import logging
import re
import time
from flask import Blueprint, request, jsonify
from utils.gemma_client import ask_gemma, ask_gemma_json, ask_gemma_chat
from utils.intent_parser import parse_intent
from utils.data_fetcher import fetch_data, summarise_for_prompt, build_chart_from_fetched, apply_sort
from utils.stocks_client import has_stock_intent, build_stock_context_text

logger = logging.getLogger(__name__)

narrative_bp = Blueprint("narrative", __name__)

NARRATOR_SYSTEM = """You are Finara, a personal finance AI. Be concise, cite exact numbers, and always end with one actionable next step.

When the user asks for a chart, graph, or visualization, describe the data in plain text — Finara will automatically render the chart in the UI. Never say you are unable to create or render a chart, and never tell the user a chart type is inappropriate for the data — the app renders exactly what they ask for. Never suggest external tools like Excel, Google Sheets, or online chart generators."""

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

    # Bar or pie — use pre-built chart_categories (accurate, pre-sorted by Java)
    data = context.get("chart_categories", [])
    if not data:
        # Fallback: build from raw categories dict
        raw = context.get("categories", {})
        data = [
            {"name": k, "value": round(v, 2)}
            for k, v in sorted(raw.items(), key=lambda x: x[1], reverse=True)
            if v > 0
        ]
    if not data:
        return reply, None

    chart_type = "bar" if any(kw in combined for kw in _BAR_KEYWORDS) else "pie"
    chart = {"type": chart_type, "title": "Spending Breakdown", "data": data}
    return clean_reply, chart


def _extract_suggestions(reply: str, message: str, context: dict) -> list:
    """Generate 4 contextual follow-up suggestion chips from the conversation so far."""
    combined = (reply + " " + message).lower()
    suggestions = []

    pools = [
        (["dining", "restaurant", "eating out", "takeout"], "How can I cut dining costs?"),
        (["groceries", "grocery", "supermarket", "food store"], "What's my average grocery spend?"),
        (["anomaly", "flagged", "unusual", "suspicious", "unexpected"], "Explain my flagged transactions"),
        (["savings", "save", "saving", "emergency fund"], "Create a savings plan for me"),
        (["forecast", "next month", "predict", "projection"], "What's next month's forecast?"),
        (["trend", "over time", "monthly trend", "month by month"], "Show my spending trend chart"),
        (["budget", "over budget", "limit"], "How am I doing on my budget?"),
        (["income", "earning", "salary", "paycheck"], "Show income vs spending chart"),
        (["category", "breakdown", "categories", "by category"], "Show spending breakdown chart"),
        (["top", "biggest", "largest", "most expensive"], "What were my biggest purchases?"),
        (["reduce", "cut", "lower", "spend less"], "Where can I spend less?"),
        (["compare", "vs last month", "versus", "compared to"], "Compare to last month"),
        (["subscription", "recurring", "monthly charge"], "Find my recurring charges"),
        (["entertainment", "streaming", "movie"], "Break down entertainment spending"),
        (["travel", "flight", "hotel", "vacation"], "Show my travel spending"),
        (["health", "medical", "pharmacy", "doctor"], "Analyze health spending"),
        (["stock", "invest", "market", "ticker", "share"], "What stocks are my spending brands?"),
        (["starbucks", "amazon", "apple", "netflix", "spotify"], "How much would I have if I invested there instead?"),
    ]

    seen = set()
    for keywords, chip in pools:
        if any(kw in combined for kw in keywords) and chip not in seen:
            seen.add(chip)
            suggestions.append(chip)
        if len(suggestions) >= 4:
            break

    defaults = [
        "Show my spending breakdown",
        "What were my top expenses?",
        "Compare to last month",
        "Create a savings plan",
        "Am I spending too much?",
        "What's my biggest expense category?",
    ]
    for d in defaults:
        if d not in seen and len(suggestions) < 4:
            seen.add(d)
            suggestions.append(d)

    return suggestions[:4]


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
                      num_ctx=1536, num_predict=380)
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


# Range-based aggregates whose window can be clamped to the UI-selected time filter.
_RANGE_TYPES = {"monthly_totals", "category_breakdown", "merchant_breakdown"}


def _ym_add(ym: str, n: int) -> str:
    """Add n months (may be negative) to a 'YYYY-MM' string."""
    y, m = int(ym[:4]), int(ym[5:7])
    idx = y * 12 + (m - 1) + n
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def _clamp_intent_to_ui(intent: dict, ui_start: str, ui_end: str) -> str:
    """
    Constrain a range-based query to the UI-selected time filter, which acts as a ceiling.
    - No explicit period in the query  → default to the UI range.
    - Requested period wider than UI    → clamp to UI and return a note to surface.
    Mutates intent['params'] (sets start_month/end_month, drops count). Returns a note or "".
    """
    if not intent or intent.get("type") not in _RANGE_TYPES:
        return ""
    if not (ui_start and ui_end):
        return ""
    if ui_start > ui_end:
        ui_start, ui_end = ui_end, ui_start

    p = intent.setdefault("params", {})

    req_start = req_end = None
    if p.get("month"):
        req_start = req_end = str(p["month"])[:7]
    elif p.get("start_month") and p.get("end_month"):
        req_start, req_end = p["start_month"], p["end_month"]
    elif p.get("count"):
        try:
            n = max(1, int(p["count"]))
        except (TypeError, ValueError):
            n = 12
        req_end = ui_end
        req_start = _ym_add(ui_end, -(n - 1))

    if req_start is None:
        # No explicit period asked for → default to the selected UI range.
        p["start_month"], p["end_month"] = ui_start, ui_end
        p.pop("count", None)
        return ""

    eff_start = max(req_start, ui_start)
    eff_end   = min(req_end, ui_end)
    clamped   = req_start < ui_start or req_end > ui_end
    p["start_month"], p["end_month"] = eff_start, eff_end
    p.pop("count", None)

    if clamped:
        return (
            f"NOTE: The user's selected time range is {ui_start} to {ui_end}. "
            f"The requested period is wider than that, so the data below is limited to "
            f"{eff_start}–{eff_end} (the selected range). Tell the user this in one short sentence."
        )
    return ""


@narrative_bp.route("/chat", methods=["POST"])
def chat():
    data    = request.get_json()
    message = data.get("message", "")
    context = data.get("context", {})
    history = data.get("history", [])

    history_context = data.get("history_context", "").strip()

    # Agentic pipeline credentials — passed from Java AiService
    user_id       = data.get("user_id")
    service_token = data.get("service_token")

    t_total = time.time()

    # ── Phase 1: Intent parsing ────────────────────────────────────────────────
    intent       = None
    fetched      = None
    fetched_text = ""
    phase1_ms    = 0
    phase2_ms    = 0

    if user_id and service_token:
        available_months = context.get("available_months", [])
        try:
            t1 = time.time()
            intent    = parse_intent(message, available_months, context, history=history)
            phase1_ms = round((time.time() - t1) * 1000)
            logger.info("intent: needs_fetch=%s type=%s (%dms)",
                        intent.get("needs_fetch"), intent.get("type"), phase1_ms)
        except Exception as exc:
            logger.warning("Phase 1 intent parse failed (non-fatal): %s", exc)
            intent = None

        # Honor the UI-selected time range: default to it, clamp anything wider.
        clamp_note = ""
        if intent and intent.get("needs_fetch") and data.get("ui_range_set"):
            try:
                clamp_note = _clamp_intent_to_ui(
                    intent, data.get("ui_start_month"), data.get("ui_end_month"))
            except Exception as exc:
                logger.warning("range clamp failed (non-fatal): %s", exc)

        # ── Phase 2: Live data fetch ───────────────────────────────────────────
        if intent and intent.get("needs_fetch") and intent.get("type"):
            try:
                t2 = time.time()
                fetched   = fetch_data(user_id, intent["type"], intent.get("params", {}),
                                       token=service_token)
                phase2_ms = round((time.time() - t2) * 1000)
                if fetched:
                    apply_sort(fetched, intent)
                    fetched_text = summarise_for_prompt(fetched, intent)
                    if clamp_note:
                        fetched_text = clamp_note + "\n" + fetched_text
                    logger.info("Phase 2 fetched %s in %dms, rows=%d",
                                intent["type"], phase2_ms, len(fetched.get("data", [])))
            except Exception as exc:
                logger.warning("Phase 2 data fetch failed (non-fatal): %s", exc)

    # ── Phase 3: Build context & call Gemma ───────────────────────────────────

    period = context.get("period", "")

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

    chart_cats = context.get("chart_categories", [])
    if chart_cats:
        top = chart_cats[:5]
        ctx_parts.append("Top spend: " + ", ".join(f"{c['name']}=${c['value']:.0f}" for c in top))
    elif context.get("categories"):
        top_raw = sorted(context["categories"].items(), key=lambda x: x[1], reverse=True)[:5]
        ctx_parts.append("Top spend: " + ", ".join(f"{k}=${v:.0f}" for k, v in top_raw))

    top_txns = context.get("top_transactions", [])
    if top_txns:
        txn_text = ", ".join(f"{t['description']} ${t['amount']:.0f}" for t in top_txns[:3])
        ctx_parts.append(f"Biggest purchases: {txn_text}")

    ctx_text      = " | ".join(ctx_parts) if ctx_parts else "No financial data loaded"
    history_block = f"\n{history_context}" if history_context else ""

    # Inject fetched live data as a separate block so Gemma treats it as authoritative
    fetched_block = f"\n\n=== LIVE FETCHED DATA (use this for your answer) ===\n{fetched_text}\n=== END LIVE DATA ===" if fetched_text else ""

    # Inject live stock/market data when the message is stock-related
    stock_block = ""
    if has_stock_intent(message):
        try:
            stock_text = build_stock_context_text(message)
            if stock_text:
                stock_block = f"\n\n=== LIVE STOCK DATA (real-time, use these exact numbers) ===\n{stock_text}\n=== END STOCK DATA ==="
        except Exception as exc:
            logger.warning("Stock data fetch failed (non-fatal): %s", exc)

    def _month_count(p):
        if p and ' to ' in p:
            a, b = p.split(' to ')
            ay, am = int(a[:4]), int(a[5:7])
            by, bm = int(b[:4]), int(b[5:7])
            return (by - ay) * 12 + (bm - am) + 1
        return 1

    n_months = _month_count(period)
    period_instruction = (
        f"\n\nCRITICAL — SELECTED PERIOD: {period} ({n_months} months). "
        f"Every dollar figure in 'User financial data' below is the TOTAL for these {n_months} months — "
        f"not monthly averages, not annualized. "
        f"When you answer, say '{period}' for the time frame. "
        f"NEVER say '13 months' or any duration other than {n_months} months. "
        f"Do NOT recalculate durations by dividing totals by a monthly rate."
    ) if period else ""

    # When live data was fetched, it (not the loaded month) defines the time frame.
    # Suppress the "selected period" pin and tell the model the chart is already drawn.
    if fetched_text:
        data_instruction = (
            "\n\nA chart has ALREADY been generated from the LIVE FETCHED DATA below and is shown to the user. "
            "Summarize those exact numbers in plain language. Do NOT say you cannot create or render a chart, "
            "and do NOT critique or second-guess the chart type the user asked for. "
            "Describe the time range and grouping exactly as reflected in the LIVE FETCHED DATA, "
            "ignoring any other 'selected period' framing. "
            "If the data begins with a NOTE about the time range being limited to the selected range, "
            "mention that limitation to the user in one short sentence."
        )
        data_header = "\n\nUser financial data: "
    else:
        data_instruction = period_instruction
        data_header = f"\n\nUser financial data ({period or 'selected period'}, {n_months} months total): "

    messages = [{
        "role":    "system",
        "content": (NARRATOR_SYSTEM + data_instruction + data_header
                    + ctx_text + history_block + fetched_block + stock_block)
    }]
    for h in history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    t3 = time.time()
    reply     = ask_gemma_chat(messages, temperature=0.7, num_ctx=2048, num_predict=600)
    gemma_ms  = round((time.time() - t3) * 1000)
    total_ms  = round((time.time() - t_total) * 1000)

    # Build chart — prefer live fetched data when available
    if fetched and intent:
        chart = build_chart_from_fetched(fetched, intent)
        clean_reply = _PLACEHOLDER_RE.sub("", reply).strip()
        clean_reply = _CHART_BOILERPLATE_RE.sub("", clean_reply).strip()
        clean_reply = re.sub(r'\n{3,}', '\n\n', clean_reply)
    else:
        clean_reply, chart = _extract_chart(reply, context, message)

    suggestions = _extract_suggestions(clean_reply, message, context)
    return jsonify({
        "reply":       clean_reply,
        "chart":       chart,
        "suggestions": suggestions,
        "timing":      {"gemma_ms": gemma_ms, "phase1_ms": phase1_ms,
                        "phase2_ms": phase2_ms, "total_ms": total_ms},
    })


@narrative_bp.route("/coach", methods=["POST"])
def spending_coach():
    data           = request.get_json()
    weekly_data    = data.get("weekly_data", {})
    budget_context = data.get("budget_context", {})

    categories = weekly_data.get("categories", {})
    total      = weekly_data.get("total", 0)
    vs_avg     = weekly_data.get("compared_to_avg", 0)
    income     = weekly_data.get("income", 0)

    top_cats  = sorted(categories.items(), key=lambda x: x[1], reverse=True)[:5]
    cat_text  = "\n".join(f"- {k}: ${v:.0f}" for k, v in top_cats)
    direction = "above" if vs_avg > 0 else "below"

    header_parts = [f"Total spent: ${total:.0f} ({abs(vs_avg):.0f}% {direction} your average week)"]
    if income:
        net = income - total
        header_parts.append(f"Income received: ${income:.0f} | Net this week: ${net:+.0f}")
    fin_header = "\n".join(header_parts)

    # Build budget section if available
    budget_block = ""
    if budget_context and budget_context.get("categories"):
        day        = budget_context.get("day_of_month", 0)
        days_total = budget_context.get("days_in_month", 30)
        pct_month  = budget_context.get("pct_through_month", 0)
        bud_cats   = budget_context.get("categories", {})

        over   = [(cat, info) for cat, info in bud_cats.items() if info.get("over_budget")]
        sorted_cats = sorted(bud_cats.items(), key=lambda x: x[1].get("pct_used", 0), reverse=True)
        bud_lines = []
        for cat, info in sorted_cats:
            b = info.get("budget", 0)
            s = info.get("spent_mtd", 0)
            r = info.get("remaining", 0)
            p = info.get("pct_used", 0)
            status = "⚠ OVER BUDGET" if info.get("over_budget") else f"{p}% of budget used"
            bud_lines.append(f"  {cat}: budget ${b:.0f} | spent MTD ${s:.0f} | remaining ${r:.0f} ({status})")

        budget_block = (
            f"\n\nMonthly budget status (day {day}/{days_total}, {pct_month}% through the month):\n"
            + "\n".join(bud_lines)
        )
        if over:
            over_names = ", ".join(cat for cat, _ in over)
            budget_block += f"\nCategories OVER BUDGET: {over_names}"

    prompt = f"""Give 5 specific, actionable money tips based on this week's spending and monthly budget status.

{fin_header}
This week by category:
{cat_text}{budget_block}

Rules:
- Each tip must mention a specific dollar amount from the data above.
- If a category is over budget or on pace to exceed it, flag it as high-impact.
- For each tip assign: category (Reduce, Save, Habit, Goal, or Warning), impact (high, medium, or low), and a how_to action step (one short sentence, max 12 words).
- At least one tip should reference the monthly budget if budget data is available.

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
