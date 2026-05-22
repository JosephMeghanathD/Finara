"""
Fetches live transaction data from the Java backend via the internal service endpoint.
Called only when intent_parser determines live data is needed for a chat query.
"""

import os
import logging
import requests

logger = logging.getLogger(__name__)

BACKEND_URL   = os.getenv("BACKEND_INTERNAL_URL", "http://localhost:8080")
SERVICE_TOKEN = os.getenv("SERVICE_TOKEN", "finara_internal_svc_token_2026")

_TIMEOUT = 8  # seconds — must be well under Gemma's own timeout


def fetch_data(user_id: int, query_type: str, params: dict,
               backend_url: str = None, token: str = None) -> dict | None:
    """
    POST /api/service/query on the Java backend.
    Returns parsed JSON or None on failure (non-fatal — chat falls back to context).
    """
    url   = (backend_url or BACKEND_URL).rstrip("/") + "/api/service/query"
    tok   = token or SERVICE_TOKEN

    try:
        resp = requests.post(
            url,
            json={"user_id": user_id, "type": query_type, "params": params},
            headers={"X-Service-Token": tok, "Content-Type": "application/json"},
            timeout=_TIMEOUT,
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning("service/query %s → %s: %s", query_type, resp.status_code, resp.text[:200])
        return None
    except Exception as exc:
        logger.warning("data_fetcher error (non-fatal): %s", exc)
        return None


def summarise_for_prompt(fetched: dict) -> str:
    """Convert fetched data to a compact text block Gemma can reason over."""
    if not fetched:
        return ""

    qtype = fetched.get("type", "")
    data  = fetched.get("data", [])

    if qtype == "daily_by_year":
        years = fetched.get("years", [])
        lines = [f"Daily spending for each year (same month), columns = {', '.join(years)}:"]
        # Summarise as totals per year (too many rows for full prompt)
        totals = {yr: 0.0 for yr in years}
        for row in data:
            for yr in years:
                totals[yr] += row.get(yr, 0)
        for yr, total in totals.items():
            lines.append(f"  {yr} total: ${total:,.0f}")
        lines.append(f"  (day-by-day chart data available for {len(data)} days)")
        return "\n".join(lines)

    if qtype == "year_over_year":
        lines = ["Year-over-year data (same month across years):"]
        for e in data:
            label = e.get("label", e.get("month", "?"))
            lines.append(f"  {label}: ${e.get('total', 0):,.0f} total spending")
        return "\n".join(lines)

    if qtype == "monthly_totals":
        lines = ["Monthly totals:"]
        for e in data:
            label = e.get("label", e.get("month", "?"))
            lines.append(f"  {label}: ${e.get('total', 0):,.0f}")
        return "\n".join(lines)

    if qtype == "category_breakdown":
        items = fetched.get("data", [])
        total = fetched.get("total", 0)
        lines = [f"Category breakdown (total ${total:,.0f}):"]
        for item in items[:10]:
            lines.append(f"  {item['name']}: ${item['value']:,.0f}")
        return "\n".join(lines)

    if qtype == "daily_totals":
        month = fetched.get("month", "")
        lines = [f"Daily spending for {month}:"]
        for e in data:
            lines.append(f"  {e['date']}: ${e['amount']:,.0f}")
        return "\n".join(lines)

    if qtype == "transaction_search":
        keyword = fetched.get("keyword", "")
        lines = [f"Transaction search results{' for ' + repr(keyword) if keyword else ''} ({len(data)} found):"]
        for row in data[:20]:
            lines.append(f"  {row['date']}: {row['description']} — ${row['amount']:,.0f} ({row['category']})")
        if len(data) > 20:
            lines.append(f"  … and {len(data) - 20} more")
        return "\n".join(lines)

    if qtype == "calendar_heatmap":
        year  = fetched.get("year", "")
        total = sum(r.get("amount", 0) for r in data)
        lines = [f"Spending calendar for {year} ({len(data)} active days, total ${total:,.0f}):"]
        monthly: dict = {}
        for r in data:
            mo = r["date"][:7]
            monthly[mo] = monthly.get(mo, 0) + r["amount"]
        for mo, v in sorted(monthly.items()):
            lines.append(f"  {mo}: ${v:,.0f}")
        return "\n".join(lines)

    return str(fetched)[:400]


def build_chart_from_fetched(fetched: dict, intent: dict) -> dict | None:
    """Build a chart payload directly from fetched data."""
    if not fetched:
        return None

    qtype      = fetched.get("type", "")
    data       = fetched.get("data", [])
    chart_type = intent.get("chart_type") or _default_chart_type(qtype)
    title      = intent.get("chart_title") or _default_title(qtype, fetched)

    if not data:
        return None

    if qtype == "daily_by_year":
        years = fetched.get("years", [])
        exclude_days = set(intent.get("params", {}).get("exclude_days", []))
        filtered = [row for row in data if row.get("day") not in exclude_days]
        if chart_type == "month_heatmap":
            return {
                "type":  "month_heatmap",
                "title": title,
                "data":  filtered,
                "years": years,
            }
        return {
            "type":    "multi_line",
            "title":   title,
            "data":    filtered,    # [{day:1, "2023":X, "2024":Y}, ...]
            "series":  years,       # ["2023", "2024", "2025"]
            "x_key":   "day",
        }

    if qtype in ("year_over_year", "monthly_totals"):
        chart_data = [
            {"month": e.get("month", ""), "label": e.get("label", e.get("month", "")),
             "total": e.get("total", 0)}
            for e in data
        ]
        return {"type": "line", "title": title, "data": chart_data}

    if qtype == "category_breakdown":
        return {"type": chart_type or "pie", "title": title, "data": fetched.get("data", [])}

    if qtype == "daily_totals":
        chart_data = [{"name": e["date"], "value": e["amount"]} for e in data]
        return {"type": "bar", "title": title, "data": chart_data}

    if qtype == "transaction_search":
        if not data:
            return None
        return {
            "type":    "table",
            "title":   title,
            "rows":    data,
            "columns": ["date", "description", "amount", "category"],
        }

    if qtype == "calendar_heatmap":
        if not data:
            return None
        return {
            "type":  "heatmap",
            "title": title,
            "year":  fetched.get("year", ""),
            "data":  data,
        }

    return None


def _default_chart_type(qtype: str) -> str:
    return {
        "year_over_year": "line", "monthly_totals": "line",
        "category_breakdown": "pie", "daily_totals": "bar",
        "calendar_heatmap": "heatmap", "transaction_search": "table",
    }.get(qtype, "bar")


def _default_title(qtype: str, fetched: dict) -> str:
    if qtype == "year_over_year":
        month_num = fetched.get("month_num", "")
        _names = {"01": "January","02": "February","03": "March","04": "April",
                  "05": "May","06": "June","07": "July","08": "August",
                  "09": "September","10": "October","11": "November","12": "December"}
        return f"{_names.get(month_num, 'Monthly')} Spending — Year over Year"
    if qtype == "monthly_totals":
        return "Monthly Spending Trend"
    if qtype == "category_breakdown":
        return "Spending Breakdown"
    if qtype == "daily_totals":
        return f"Daily Spending — {fetched.get('month', '')}"
    if qtype == "calendar_heatmap":
        return f"{fetched.get('year', '')} Spending Calendar"
    if qtype == "transaction_search":
        kw = fetched.get("keyword", "")
        return f"Transactions: {kw}" if kw else "Transaction Search"
    return "Spending Chart"
