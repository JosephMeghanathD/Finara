"""
Parses chat messages to determine if live data fetching is needed,
and what query to run against the Java service endpoint.
"""

import logging
import re
from datetime import datetime
from utils.gemma_client import ask_gemma_json

_CURRENT_YEAR = datetime.now().year

logger = logging.getLogger(__name__)

_SYSTEM = """You are a financial data query classifier. Analyse the user's message and output JSON only.

Determine if the message requires fetching specific historical data NOT already provided in the chat context.

Output exactly this JSON shape:
{
  "needs_fetch": <true|false>,
  "type": <"year_over_year"|"monthly_totals"|"category_breakdown"|"daily_totals"|null>,
  "params": <object>,
  "chart_type": <"line"|"bar"|"pie"|null>,
  "chart_title": <string>
}

Output ALSO a "group_by" field: "month"|"category"|"merchant"|"day"|"year"|null.
Honor the user's stated grouping, time window, filters, and chart type — do not substitute your own.

GROUPING → TYPE (copy the user's stated grouping exactly):
- by month → "monthly_totals" (group_by "month")
- by category → "category_breakdown" (group_by "category")
- by merchant / store / vendor → "merchant_breakdown" (group_by "merchant")
- day-by-day within ONE month → "daily_totals" (group_by "day")
- ONE month compared ACROSS YEARS → "year_over_year" (group_by "year", params {"month_num":"04"})
  (If the user says "[month] daily/total spendings over the years" it is STILL year_over_year.)

TIME WINDOW (in params):
- "last/past N months" → {"count": N}
- explicit range → {"start_month":"YYYY-MM","end_month":"YYYY-MM"}
- one month → {"month":"YYYY-MM"}

FILTERS (add to params when present):
- amount → {"min_amount": N} and/or {"max_amount": N}
- include only a category → {"category":"Groceries"}
- include only a merchant → {"merchant":"amazon"}
- EXCLUDE a merchant → {"exclude_merchant":"rent"}   (drops matching transactions from the totals)
- EXCLUDE a category → {"exclude_category":"Housing"}
- SORT → {"sort_by":"amount"|"name","sort_dir":"asc"|"desc"}

FOLLOW-UPS: for a short follow-up like "exclude rent", "sort ascending", "now as a bar",
"same for last year" — KEEP the previous type, group_by, period and filters from the
conversation and only ADD or CHANGE what the new message says.

CHART TYPE — if the user names one, copy it. Available: pie, bar, line, table, stacked_bar,
stacked_area, treemap, matrix_heatmap, heatmap (calendar), sankey, waterfall, radar, scatter, gauge.
If they DON'T name one, pick the best fit: category over several months→stacked_bar; category one month→pie;
monthly trend→line; by merchant→treemap; money flow→sankey; cash flow/paycheck→waterfall; budget/goal→gauge;
daily calendar→heatmap; profile→radar; outliers/anomalies→scatter. Otherwise null.

needs_fetch=true whenever the user asks for a grouping, trend, comparison, a period beyond the loaded month,
or filtered totals. needs_fetch=false for greetings or questions already answered by the loaded context.

EXAMPLES:
- "last 10 months as a pie chart grouped by month" → {"needs_fetch":true,"type":"monthly_totals","group_by":"month","params":{"count":10},"chart_type":"pie","chart_title":"Spending by Month — Last 10 Months"}
- "spending by category over the last 3 months as a bar chart" → {"needs_fetch":true,"type":"category_breakdown","group_by":"category","params":{"count":3},"chart_type":"bar","chart_title":"Spending by Category"}
- "who are my top merchants this year" → {"needs_fetch":true,"type":"merchant_breakdown","group_by":"merchant","params":{"start_month":"2026-01","end_month":"2026-12"},"chart_type":null,"chart_title":"Top Merchants"}
- "show june spendings over the years" → {"needs_fetch":true,"type":"year_over_year","group_by":"year","params":{"month_num":"06"},"chart_type":"line","chart_title":"June — Year over Year"}
- "daily spending in June 2025" → {"needs_fetch":true,"type":"daily_totals","group_by":"day","params":{"month":"2025-06"},"chart_type":"bar","chart_title":"Daily Spending — June 2025"}
- "last 12 months trend" → {"needs_fetch":true,"type":"monthly_totals","group_by":"month","params":{"count":12},"chart_type":"line","chart_title":"Monthly Spending Trend"}
"""

# Generous gate — only skip the planner when the message shows NONE of these.
# (The old list was too stingy: it missed "last 10 months", "grouped by month", etc.)
_DATA_HINTS = [
    "over the years", "each year", "year by year", "year over year", "annually",
    "2021", "2022", "2023", "2024", "2025", "2026",
    "daily", "day by day", "each day", "every day", "per day",
    "last", "past", "previous", "recent", "trend", "compare", "comparison", " vs ",
    "all time", "all history", "all months", "history",
    "group", "grouped", "by month", "by category", "by merchant", "by store", "by vendor",
    "per month", "per category", "breakdown", "break down",
    "chart", "graph", "pie", "bar", "line", "table", "plot",
    "spend", "spent", "spending", "charge", "transaction", "purchase", "cost",
    "total", "how much", "top", "biggest", "highest", "lowest", "average",
    "merchant", "category", "categories", "month", "year",
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "$", "over", "under", "between", "more than", "less than",
]

_NULL_RESULT = {"needs_fetch": False, "type": None, "params": {}, "chart_type": None, "chart_title": ""}

# Matches amounts like "$2000", "2k", "2.5k", "500"
_AMT_RE = r'\$?(\d+(?:\.\d+)?)(k)?'

def _parse_amount_bounds(msg: str) -> tuple:
    """
    Parse amount filter phrases. Returns (min_amount, max_amount) as floats or None.
    Handles: "less than 2k", "under $500", "over $100", "between $50 and $200", etc.
    """
    def _amt(num: str, k: str) -> float:
        v = float(num.replace(',', ''))
        return v * 1000 if k else v

    min_amt, max_amt = None, None

    m = re.search(r'(?:less than|under|below|no more than|at most|not more than|smaller than)\s+' + _AMT_RE, msg)
    if m:
        max_amt = _amt(m.group(1), m.group(2))

    m = re.search(r'(?:more than|over|above|at least|greater than|bigger than|exceeds?)\s+' + _AMT_RE, msg)
    if m:
        min_amt = _amt(m.group(1), m.group(2))

    m = re.search(r'between\s+' + _AMT_RE + r'\s+and\s+' + _AMT_RE, msg)
    if m:
        min_amt = _amt(m.group(1), m.group(2))
        max_amt = _amt(m.group(3), m.group(4))

    return min_amt, max_amt

# Month name → 2-digit number
_MONTH_MAP = {
    "january": "01", "february": "02", "march": "03", "april": "04",
    "may": "05", "june": "06", "july": "07", "august": "08",
    "september": "09", "october": "10", "november": "11", "december": "12",
}

_YOY_PHRASES = ["over the years", "each year", "year by year", "year over year", "annually",
                 "per year", "across years", "across the years", "each passing year"]


def _fast_yoy_override(message: str) -> dict | None:
    """
    Deterministic override: if the message clearly asks for YOY, bypass Gemma classification.
    - With "daily" keyword → daily_by_year (day-of-month × year multi-line chart)
    - Without "daily"     → year_over_year (one total per year, single line)
    Returns intent dict or None if not applicable.
    """
    msg = message.lower()
    if not any(ph in msg for ph in _YOY_PHRASES):
        return None

    month_num = None
    for name, num in _MONTH_MAP.items():
        if name in msg:
            month_num = num
            break

    if month_num is None:
        return None

    month_names_inv = {v: k.capitalize() for k, v in _MONTH_MAP.items()}
    month_name = month_names_inv[month_num]

    _DAILY_SIGNALS   = ["daily", "day by day", "each day", "every day", "per day"]
    _HEATMAP_WORDS   = ["heatmap", "heat map", "heat-map"]
    if any(kw in msg for kw in _DAILY_SIGNALS):
        wants_heatmap = any(kw in msg for kw in _HEATMAP_WORDS)

        # Parse "don't include day N", "exclude day N", "skip day N", "without day N"
        # Two-step: first check if any exclusion signal exists (handles typos),
        # then extract all "day N" numbers mentioned in the message.
        _EXCL_SIGNALS = [
            "don't include", "dont include", "don't inlcude", "dont inlcude",
            "don't show", "dont show", "exclude", "skip", "without", "remove",
            "except day", "not day", "no day",
        ]
        exclude_days = []
        if any(sig in msg for sig in _EXCL_SIGNALS):
            exclude_days = [int(m) for m in re.findall(r'\bday\s+(\d+)\b', msg)]

        params: dict = {"month_num": month_num}
        if exclude_days:
            params["exclude_days"] = exclude_days
        min_amt, max_amt = _parse_amount_bounds(msg)
        if min_amt is not None: params["min_amount"] = min_amt
        if max_amt is not None: params["max_amount"] = max_amt

        return {
            "needs_fetch": True,
            "type": "daily_by_year",
            "params": params,
            "chart_type": "month_heatmap" if wants_heatmap else "multi_line",
            "chart_title": f"{month_name} Daily Spending — Year over Year",
        }

    # Plain annual totals
    min_amt, max_amt = _parse_amount_bounds(msg)
    yoy_params: dict = {"month_num": month_num}
    if min_amt is not None: yoy_params["min_amount"] = min_amt
    if max_amt is not None: yoy_params["max_amount"] = max_amt
    return {
        "needs_fetch": True,
        "type": "year_over_year",
        "params": yoy_params,
        "chart_type": "line",
        "chart_title": f"{month_name} Spending — Year over Year",
    }


_HEATMAP_SIGNALS = [
    "heatmap", "heat map", "spending calendar", "calendar view",
    "calendar heatmap", "daily heatmap", "contribution graph",
]

def _fast_heatmap_override(message: str) -> dict | None:
    msg = message.lower()
    if not any(kw in msg for kw in _HEATMAP_SIGNALS):
        return None
    m = re.search(r'\b(20\d{2})\b', msg)
    year = m.group(1) if m else str(_CURRENT_YEAR)
    return {
        "needs_fetch": True,
        "type":        "calendar_heatmap",
        "params":      {"year": year},
        "chart_type":  "heatmap",
        "chart_title": f"{year} Spending Calendar",
    }


_SEARCH_SIGNALS = [
    "find all", "search for", "look for", "look up",
    "show all charges", "show all transactions",
    "list all charges", "list all transactions",
    "list my charges", "list my transactions",
    "transactions from", "transactions at",
    "charges from", "charges at",
    "payments to", "payments at",
    "show me charges", "show me transactions",
]

def _fast_search_override(message: str) -> dict | None:
    msg = message.lower()
    if not any(sig in msg for sig in _SEARCH_SIGNALS):
        return None

    # Extract merchant/keyword after preposition
    keyword = ""
    for pat in [
        r'\b(?:from|at|to|by)\s+([A-Za-z0-9&\'\.\-]{2,30}?)(?=\s+(?:over|under|above|below|last|in\s+20|this|between|charges?|transactions?|payments?|$))',
        r'\b(?:find all|search for|look for)\s+(?:all\s+)?(?:my\s+)?([A-Za-z0-9&\'\.\- ]{2,25}?)\s+(?:charges?|transactions?|payments?|purchases?)',
    ]:
        m = re.search(pat, msg, re.IGNORECASE)
        if m:
            kw = m.group(1).strip()
            if kw not in ('all', 'my', 'the', 'a', 'an'):
                keyword = kw
                break

    # Amount constraints
    min_amount, max_amount = None, None
    m = re.search(r'\b(?:over|above|more than|greater than)\s+\$?(\d+(?:\.\d+)?)', msg)
    if m: min_amount = float(m.group(1))
    m = re.search(r'\b(?:under|below|less than|smaller than)\s+\$?(\d+(?:\.\d+)?)', msg)
    if m: max_amount = float(m.group(1))

    # Date range
    start_month, end_month = "", ""
    if re.search(r'\blast year\b', msg):
        yr = _CURRENT_YEAR - 1
        start_month, end_month = f"{yr}-01", f"{yr}-12"
    else:
        m = re.search(r'\b(20\d{2})\b', msg)
        if m:
            yr = m.group(1)
            start_month, end_month = f"{yr}-01", f"{yr}-12"

    params: dict = {"keyword": keyword, "start_month": start_month, "end_month": end_month}
    if min_amount is not None: params["min_amount"] = min_amount
    if max_amount is not None: params["max_amount"] = max_amount

    title = f"Transactions: {keyword}" if keyword else "Transaction Search"
    return {
        "needs_fetch": True,
        "type":        "transaction_search",
        "params":      params,
        "chart_type":  "table",
        "chart_title": title,
    }


# ── Deterministic hint extractors (reinforce / repair the LLM's output) ─────────

_GROUP_TO_TYPE = {
    "month": "monthly_totals", "category": "category_breakdown",
    "merchant": "merchant_breakdown", "day": "daily_totals", "year": "year_over_year",
}

_CHART_WORD_RE = [
    (re.compile(r'\bstacked\s+area\b'), "stacked_area"),
    (re.compile(r'\bstacked\s+bar\b'), "stacked_bar"),
    (re.compile(r'\bstacked\b'), "stacked_bar"),
    (re.compile(r'\barea\s+chart\b'), "stacked_area"),
    (re.compile(r'\btree\s?map\b'), "treemap"),
    (re.compile(r'\b(?:sankey|money\s*flow|flow\s+(?:chart|diagram))\b'), "sankey"),
    (re.compile(r'\bwaterfall\b'), "waterfall"),
    (re.compile(r'\b(?:radar|spider)\s*(?:chart)?\b'), "radar"),
    (re.compile(r'\bscatter\b'), "scatter"),
    (re.compile(r'\b(?:gauge|dial|progress\s+(?:bar|meter|ring))\b'), "gauge"),
    (re.compile(r'\b(?:matrix\s*heat\s*map|matrix|grid\s*heat\s*map)\b'), "matrix_heatmap"),
    (re.compile(r'\b(?:calendar\s*heat\s*map|spending\s*calendar|calendar)\b'), "heatmap"),
    (re.compile(r'\bheat\s?map\b'), "heatmap"),
    (re.compile(r'\bpie\b'), "pie"),
    (re.compile(r'\bbar\b'), "bar"),
    (re.compile(r'\b(?:line|trend)\b'), "line"),
    (re.compile(r'\b(?:table|list)\b'), "table"),
]

# Chart types that require a specific backend fetch type.
_CHART_FETCH = {
    "sankey": "money_flow", "waterfall": "money_flow", "gauge": "money_flow",
    "stacked_bar": "category_month_matrix", "stacked_area": "category_month_matrix",
    "matrix_heatmap": "category_month_matrix",
    "scatter": "transaction_points",
}

# Phrases that imply a specific fetch type regardless of grouping.
_SPECIAL_TYPE_PHRASES = [
    (("money flow", "where does my money go", "where my money goes",
      "flow of money", "cash flow", "sankey"), "money_flow"),
    (("outlier", "outliers", "individual transaction", "each transaction",
      "scatter", "anomal", "flagged transaction"), "transaction_points"),
]

_GROUP_BY_RE = re.compile(
    r'(?:group(?:ed)?\s+by|broken\s+down\s+by|by|per|for\s+each)\s+'
    r'(months?|categor(?:y|ies)|merchants?|stores?|vendors?|days?|daily|years?)'
)
_GROUP_WORD = {
    "month": "month", "months": "month", "category": "category", "categories": "category",
    "merchant": "merchant", "merchants": "merchant", "store": "merchant", "stores": "merchant",
    "vendor": "merchant", "vendors": "merchant", "day": "day", "days": "day", "daily": "day",
    "year": "year", "years": "year",
}

_LAST_N_RE = re.compile(r'\b(?:last|past|previous|recent)\s+(\d{1,2})\s+months?\b')
_LAST_N_YEARS_RE = re.compile(r'\b(?:last|past|previous|recent)\s+(\d{1,2})\s+years?\b')

_EXCLUDE_RE = re.compile(
    r'\b(?:exclude|excluding|without|except(?:\s+for)?|other than|besides|ignore|'
    r'not\s+including|leave\s+out|drop|remove)\s+(.+)$',
    re.IGNORECASE,
)
# Trailing phrases that are NOT part of the excluded term.
_EXCLUDE_TAIL_RE = re.compile(
    r'\s+(?:as\s+a|as|in\s+a|sorted|sort(?:ed)?|order(?:ed)?|grouped|group\s+by|'
    r'by\s+month|by\s+category|by\s+merchant|and\s+sort|from\s+(?:high|low)).*$',
    re.IGNORECASE,
)

# Known spending categories — decides whether an exclusion term is a category or a merchant.
_KNOWN_CATEGORIES = {
    "housing", "transportation", "groceries", "food & drink", "food and drink",
    "dining", "shopping", "utilities", "healthcare", "entertainment",
    "personal care", "travel", "education", "insurance", "subscriptions", "income", "transfer",
}


def _explicit_exclude(message: str) -> str | None:
    m = _EXCLUDE_RE.search(message.strip())
    if not m:
        return None
    term = _EXCLUDE_TAIL_RE.sub("", m.group(1).strip())
    term = term.strip().strip('.,"\'')
    return term or None


def _explicit_sort(msg: str):
    """Returns (sort_by, sort_dir) or None. sort_by ∈ {amount, name}."""
    sort_by, sort_dir = None, None
    if any(k in msg for k in ("alphabetical", "by name", "a to z", "a-z")):
        sort_by, sort_dir = "name", "asc"
    if any(k in msg for k in ("z to a", "z-a", "reverse alphabetical")):
        sort_by, sort_dir = "name", "desc"
    if any(k in msg for k in ("by amount", "by value", "by spend", "by total", "by size")):
        sort_by = "amount"
    if any(k in msg for k in ("ascending", "smallest first", "lowest first", "low to high",
                              "least to most", "smallest to largest", "ascend")):
        sort_by, sort_dir = sort_by or "amount", "asc"
    if any(k in msg for k in ("descending", "largest first", "highest first", "high to low",
                              "biggest first", "most to least", "largest to smallest", "descend")):
        sort_by, sort_dir = sort_by or "amount", "desc"
    if sort_by and not sort_dir:
        sort_dir = "asc" if sort_by == "name" else "desc"
    return (sort_by, sort_dir) if sort_by else None


def _explicit_chart_type(msg: str) -> str | None:
    for rx, ct in _CHART_WORD_RE:
        if rx.search(msg):
            return ct
    return None


def _explicit_intent_type(msg: str) -> str | None:
    for kws, t in _SPECIAL_TYPE_PHRASES:
        if any(k in msg for k in kws):
            return t
    return None


def _span_months(params: dict) -> int:
    if params.get("count"):
        try: return max(1, int(params["count"]))
        except (TypeError, ValueError): return 1
    sm, em = params.get("start_month"), params.get("end_month")
    if sm and em:
        try: return (int(em[:4]) - int(sm[:4])) * 12 + (int(em[5:7]) - int(sm[5:7])) + 1
        except (TypeError, ValueError): return 1
    return 1


_ALL_CHART_TYPES = {
    "pie", "bar", "line", "table", "treemap", "radar", "scatter", "sankey",
    "waterfall", "gauge", "stacked_bar", "stacked_area", "matrix_heatmap", "heatmap",
}


def _resolve_chart_and_type(result: dict, explicit_chart: str | None) -> None:
    """
    Decide the final chart_type and, when a chart needs specific data, the fetch type.
    Explicit user choice always wins (deterministic word OR a valid LLM pick);
    otherwise pick the best-fit chart for the query.
    """
    t = result.get("type")
    params = result.get("params", {})

    # Honor the LLM's chart choice when the deterministic layer didn't catch a word.
    llm_chart = result.get("chart_type")
    chosen = explicit_chart or (llm_chart if llm_chart in _ALL_CHART_TYPES else None)

    if chosen:
        # A generic "heatmap" in a category/monthly context means the category×month grid.
        if chosen == "heatmap" and t in ("category_breakdown", "category_month_matrix", "monthly_totals"):
            chosen = "matrix_heatmap"
        result["chart_type"] = chosen
        ft = _CHART_FETCH.get(chosen)
        if ft:
            result["type"] = ft
            result["needs_fetch"] = True
        elif result.get("type") is None and chosen in ("treemap", "radar", "pie", "bar"):
            result["type"] = "category_breakdown"
            result["needs_fetch"] = True
        elif result.get("type"):
            # An explicitly named chart always needs real data: only
            # build_chart_from_fetched can emit treemap/radar/table, so without a
            # fetch the no-fetch fallback silently drops the request (or downgrades
            # it to pie/bar). The planner's needs_fetch=false doesn't apply here.
            result["needs_fetch"] = True
        return

    # Smart default when the user didn't name a chart.
    span = _span_months(params)
    if t == "category_breakdown":
        if span >= 3:
            result["type"] = "category_month_matrix"
            result["chart_type"] = "stacked_bar"
        else:
            result["chart_type"] = "pie"
    elif t == "merchant_breakdown":
        result["chart_type"] = "treemap"
    elif t == "monthly_totals":
        result["chart_type"] = "line"
    elif t == "money_flow":
        result["chart_type"] = "sankey"
    elif t == "transaction_points":
        result["chart_type"] = "scatter"
    # daily_totals / year_over_year / category_month_matrix / calendar_heatmap:
    # leave chart_type as-is (build_chart_from_fetched applies its own default).


def _explicit_group_by(msg: str) -> str | None:
    m = _GROUP_BY_RE.search(msg)
    return _GROUP_WORD.get(m.group(1)) if m else None


def _last_n_months(msg: str) -> int | None:
    """A 'last N months' OR 'last N years' window, normalized to a month count."""
    m = _LAST_N_RE.search(msg)
    if m:
        return int(m.group(1))
    y = _LAST_N_YEARS_RE.search(msg)
    if y:
        return int(y.group(1)) * 12
    return None


def _format_history(history: list, limit: int = 4) -> str:
    """Compact transcript of the last few turns so the planner can resolve references."""
    if not history:
        return ""
    lines = []
    for h in history[-limit:]:
        who = "User" if h.get("role") == "user" else "Assistant"
        content = (h.get("content", "") or "").strip().replace("\n", " ")[:200]
        if content:
            lines.append(f"{who}: {content}")
    return "\n".join(lines)


def _classify_llm(message: str, available_months: list, context: dict,
                  history: list = None, num_predict: int = 260) -> dict:
    months_sample = ", ".join(sorted(available_months)[-8:]) if available_months else "none"
    history_months = [e.get("month", "") for e in context.get("monthly_history", [])]
    transcript = _format_history(history)
    convo = (
        "Recent conversation (resolve references like 'that', 'same', 'it', 'those' "
        f"against it):\n{transcript}\n\n" if transcript else ""
    )
    prompt = (
        f"Available months in database: {months_sample}\n"
        f"Months already in chat context: {', '.join(history_months) or 'none'}\n\n"
        f"{convo}"
        f'Current user message: "{message}"\n\n'
        f"Plan the query for the CURRENT message (using the conversation to fill in any implied grouping, period, filters, or chart type)."
    )
    result = ask_gemma_json(prompt, system=_SYSTEM, num_ctx=1024, num_predict=num_predict)
    return result if isinstance(result, dict) else dict(_NULL_RESULT)


def parse_intent(message: str, available_months: list, context: dict, history: list = None) -> dict:
    """
    Returns a query spec: needs_fetch, type, group_by, params, chart_type, chart_title.
    Deterministic hints (grouping, chart type, last-N, amount) override the LLM so an
    explicitly stated request is always honored. `history` (recent turns) lets the
    planner resolve follow-ups like "now as a bar" / "same for last year".
    Falls back to _NULL_RESULT on error.
    """
    msg = message.lower()

    # Extract explicit hints up front — needed to arbitrate the fast paths.
    group_by         = _explicit_group_by(msg)
    chart_type       = _explicit_chart_type(msg)
    last_n           = _last_n_months(msg)
    min_amt, max_amt = _parse_amount_bounds(msg)
    exclude_term     = _explicit_exclude(message)
    sort_spec        = _explicit_sort(msg)
    type_phrase      = _explicit_intent_type(msg)
    has_hint = bool(group_by or chart_type or last_n is not None or exclude_term or sort_spec
                    or type_phrase or min_amt is not None or max_amt is not None)

    # Deterministic fast paths. An explicit aggregate grouping ("grouped by month/
    # category/merchant") takes priority over transaction search, which otherwise
    # hijacks messages like "show me transactions over $2000 grouped by month".
    yoy = _fast_yoy_override(message)
    if yoy: return yoy
    # The calendar-heatmap fast path only applies to an ungrouped daily calendar —
    # don't let it hijack "matrix heatmap" or a grouped request.
    if not group_by and "matrix" not in msg:
        heatmap = _fast_heatmap_override(message)
        if heatmap: return heatmap
    if not group_by:
        search = _fast_search_override(message)
        if search: return search

    # Generous gate: only skip the planner when nothing suggests a data query
    # (and there is no prior conversation that could make this a follow-up).
    if not has_hint and not history and not any(sig in msg for sig in _DATA_HINTS):
        return dict(_NULL_RESULT)

    try:
        result = _classify_llm(message, available_months, context, history=history)
    except Exception as exc:
        logger.warning("intent classify failed (non-fatal): %s", exc)
        result = dict(_NULL_RESULT)

    result.setdefault("params", {})
    result.setdefault("chart_title", "")

    # Map LLM group_by → type when type is missing.
    if not result.get("type") and result.get("group_by"):
        result["type"] = _GROUP_TO_TYPE.get(result["group_by"])

    # Deterministic overrides win over the LLM.
    if group_by:
        result["group_by"] = group_by
        result["type"] = _GROUP_TO_TYPE.get(group_by, result.get("type"))
        result["needs_fetch"] = True
    if type_phrase:
        result["type"] = type_phrase
        result["needs_fetch"] = True
    if last_n is not None:
        result["params"]["count"] = last_n
        result["params"].pop("start_month", None)
        result["params"].pop("end_month", None)
        result["needs_fetch"] = True
        # A "last N months/years" window with no explicit grouping is a monthly trend —
        # force it only over an empty/year_over_year guess, never over a real breakdown
        # type ("top merchants last 6 months" must stay merchant_breakdown).
        if group_by in (None, "month") and result.get("type") in (None, "year_over_year"):
            result["type"] = "monthly_totals"
            result["group_by"] = "month"
    if min_amt is not None: result["params"]["min_amount"] = min_amt
    if max_amt is not None: result["params"]["max_amount"] = max_amt

    # Exclusion filter — a category name → exclude_category, otherwise exclude_merchant.
    if exclude_term:
        if exclude_term.lower() in _KNOWN_CATEGORIES:
            result["params"]["exclude_category"] = exclude_term
        else:
            result["params"]["exclude_merchant"] = exclude_term
        result["needs_fetch"] = True

    # Sorting.
    if sort_spec:
        result["params"]["sort_by"], result["params"]["sort_dir"] = sort_spec
        result["needs_fetch"] = True

    result.setdefault("needs_fetch", False)
    result.setdefault("chart_type", None)

    # Repair pass (≤2 LLM calls): data clearly wanted but no usable type.
    if result.get("needs_fetch") and not result.get("type"):
        try:
            repaired = _classify_llm(
                message + "\n\nYou MUST return a non-null type and group_by.",
                available_months, context, history=history, num_predict=200)
            if repaired.get("type"):
                repaired.setdefault("params", {})
                repaired["params"].update(result.get("params", {}))
                if chart_type: repaired["chart_type"] = chart_type
                if group_by:   repaired["group_by"] = group_by
                repaired["needs_fetch"] = True
                result = repaired
        except Exception as exc:
            logger.warning("intent repair failed (non-fatal): %s", exc)

    # Resolve the chart type (explicit wins; else best-fit) and any chart-driven fetch type.
    _resolve_chart_and_type(result, chart_type)

    # No usable type → don't fetch (chat falls back to loaded context).
    if not result.get("type"):
        result["needs_fetch"] = False

    return result
