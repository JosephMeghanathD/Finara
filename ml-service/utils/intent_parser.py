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

Query types — pick the FIRST that matches:
1. "year_over_year": user wants a SPECIFIC MONTH compared ACROSS MULTIPLE YEARS.
   Triggers: "over the years", "each year", "year by year", "year over year", "annually",
             "[month name] spending over the years", "[month name] spendings over the years",
             "how has [month] changed", "compare [month] across years".
   IMPORTANT: If the user says "[month] daily/weekly/total spendings over the years" → this is STILL year_over_year, not daily_totals.
   params: {"month_num": "06"}  (zero-padded 2-digit month — 01=Jan … 12=Dec)

2. "monthly_totals": trend across MANY CONSECUTIVE months in sequence.
   Triggers: "last 12 months", "spending trend this year", "all my history", "all months", "past year".
   params: {"count": 12} or {"start_month": "YYYY-MM", "end_month": "YYYY-MM"}

3. "category_breakdown": spending broken down by CATEGORY for one specific period.
   Triggers: "what did I spend on in March", "April breakdown", "categories for June".
   params: {"month": "YYYY-MM"} or {"start_month":"YYYY-MM","end_month":"YYYY-MM"}

4. "daily_totals": day-BY-day amounts WITHIN a single month (NOT across years).
   Triggers: "daily spending in May 2026", "each day in June 2025", "day by day for this month".
   params: {"month": "YYYY-MM"}  — MUST be full YYYY-MM format with the year.

Set needs_fetch=false when the chat context (monthly_history, chart_categories) already has all the data.
Set needs_fetch=true when data spans years or is outside the 6-month context window.

Examples:
- "show june spendings over the years" → year_over_year, month_num="06"
- "show may daily spendings over the years" → year_over_year, month_num="05"  (over the years = YOY, not daily!)
- "show june daily spendings over the years" → year_over_year, month_num="06"
- "daily spending in June 2025" → daily_totals, month="2025-06"
- "each day this month" → daily_totals, month=current YYYY-MM
- "last 12 months trend" → monthly_totals, count=12
"""

# Fast heuristic — skip Gemma if message has none of these
_FETCH_SIGNALS = [
    "over the years", "each year", "year by year", "year over year",
    "annually", "2022", "2023", "2024", "2025", "2026",
    "daily", "day by day", "each day", "every day",
    "last 12", "past year", "all time", "all history", "all months",
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]

_NULL_RESULT = {"needs_fetch": False, "type": None, "params": {}, "chart_type": None, "chart_title": ""}

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

    _DAILY_SIGNALS = ["daily", "day by day", "each day", "every day", "per day"]
    if any(kw in msg for kw in _DAILY_SIGNALS):
        # User wants day-of-month breakdown per year (multiple lines)
        return {
            "needs_fetch": True,
            "type": "daily_by_year",
            "params": {"month_num": month_num},
            "chart_type": "multi_line",
            "chart_title": f"{month_name} Daily Spending — Year over Year",
        }

    # Plain annual totals
    return {
        "needs_fetch": True,
        "type": "year_over_year",
        "params": {"month_num": month_num},
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


def parse_intent(message: str, available_months: list, context: dict) -> dict:
    """
    Returns intent dict with fields: needs_fetch, type, params, chart_type, chart_title.
    Falls back to _NULL_RESULT on any error so chat always works.
    """
    yoy = _fast_yoy_override(message)
    if yoy: return yoy

    heatmap = _fast_heatmap_override(message)
    if heatmap: return heatmap

    search = _fast_search_override(message)
    if search: return search

    msg_lower = message.lower()
    if not any(sig in msg_lower for sig in _FETCH_SIGNALS):
        return _NULL_RESULT

    months_sample = ", ".join(sorted(available_months)[-8:]) if available_months else "none"
    history_months = [e.get("month", "") for e in context.get("monthly_history", [])]

    prompt = (
        f"Available months in database: {months_sample}\n"
        f"Months already in chat context: {', '.join(history_months) or 'none'}\n\n"
        f'User message: "{message}"\n\n'
        f"Classify the data fetch intent."
    )

    try:
        result = ask_gemma_json(prompt, system=_SYSTEM, num_ctx=768, num_predict=220)
        # Ensure all keys are present
        result.setdefault("needs_fetch", False)
        result.setdefault("type", None)
        result.setdefault("params", {})
        result.setdefault("chart_type", None)
        result.setdefault("chart_title", "")
        return result
    except Exception as exc:
        logger.warning("intent_parser failed (non-fatal): %s", exc)
        return _NULL_RESULT
