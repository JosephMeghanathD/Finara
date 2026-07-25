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


def _filter_note(intent: dict | None) -> str:
    """One-line description of any active filters, so the LLM's prose matches the data."""
    if not intent:
        return ""
    p = intent.get("params", {}) or {}
    bits = []
    if p.get("category"):    bits.append(f"category = {p['category']}")
    if p.get("merchant") or p.get("keyword"):
        bits.append(f"merchant ~ {p.get('merchant') or p.get('keyword')}")
    if p.get("exclude_merchant"): bits.append(f"EXCLUDING merchant ~ {p['exclude_merchant']}")
    if p.get("exclude_category"): bits.append(f"EXCLUDING category {p['exclude_category']}")
    if p.get("min_amount") is not None: bits.append(f"amount ≥ ${p['min_amount']:,.0f}")
    if p.get("max_amount") is not None: bits.append(f"amount ≤ ${p['max_amount']:,.0f}")
    if p.get("sort_by"): bits.append(f"sorted by {p['sort_by']} {p.get('sort_dir','desc')}")
    return ("Filters applied (numbers below already reflect these): " + ", ".join(bits) + "\n") if bits else ""


def summarise_for_prompt(fetched: dict, intent: dict | None = None) -> str:
    """Convert fetched data to a compact text block Gemma can reason over."""
    if not fetched:
        return ""

    qtype = fetched.get("type", "")
    data  = fetched.get("data", [])
    note  = _filter_note(intent)

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
        lines = [note + "Monthly totals:"]
        for e in data:
            label = e.get("label", e.get("month", "?"))
            lines.append(f"  {label}: ${e.get('total', 0):,.0f}")
        return "\n".join(lines)

    if qtype in ("category_breakdown", "merchant_breakdown"):
        items = fetched.get("data", [])
        total = fetched.get("total", 0)
        heading = "Merchant breakdown" if qtype == "merchant_breakdown" else "Category breakdown"
        lines = [f"{note}{heading} (total ${total:,.0f}):"]
        for item in items[:12]:
            lines.append(f"  {item['name']}: ${item['value']:,.0f}")
        return "\n".join(lines)

    if qtype == "category_month_matrix":
        cats   = fetched.get("categories", [])
        months = fetched.get("months", [])
        totals = {c: 0.0 for c in cats}
        for row in data:
            for c in cats:
                totals[c] += row.get(c, 0) or 0
        lines = [f"{note}Category spending across {len(months)} months "
                 f"({months[0] if months else '?'}–{months[-1] if months else '?'}):"]
        for c, v in sorted(totals.items(), key=lambda x: -x[1]):
            lines.append(f"  {c}: ${v:,.0f} total")
        return "\n".join(lines)

    if qtype == "money_flow":
        income = fetched.get("income", 0)
        nodes  = fetched.get("nodes", [])
        links  = fetched.get("links", [])
        lines = [f"{note}Money flow — income ${income:,.0f}, then to categories:"]
        for l in links:
            if l.get("source") == 0:
                tgt = l.get("target")
                name = nodes[tgt]["name"] if isinstance(tgt, int) and 0 <= tgt < len(nodes) else "?"
                lines.append(f"  → {name}: ${l.get('value', 0):,.0f}")
        return "\n".join(lines)

    if qtype == "transaction_points":
        anoms = [d for d in data if d.get("anomaly")]
        lines = [f"{note}{len(data)} transactions; {len(anoms)} flagged as anomalies. Largest:"]
        for d in sorted(data, key=lambda x: -x.get("amount", 0))[:5]:
            flag = " (anomaly)" if d.get("anomaly") else ""
            lines.append(f"  {d.get('date')}: {d.get('description')} ${d.get('amount', 0):,.0f}{flag}")
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


def apply_sort(fetched: dict, intent: dict) -> None:
    """Reorder fetched['data'] in place per intent params sort_by (amount|name) / sort_dir (asc|desc).

    No-op unless a sort was explicitly requested — the DB already returns a sensible
    default order (amount desc for breakdowns, chronological for series)."""
    if not fetched or not intent:
        return
    p = intent.get("params", {}) or {}
    sort_by = p.get("sort_by")
    data = fetched.get("data")
    if not sort_by or not isinstance(data, list) or not data:
        return
    sort_dir = p.get("sort_dir") or ("asc" if sort_by == "name" else "desc")
    reverse = sort_dir == "desc"

    def value_of(e):
        for k in ("value", "total", "amount"):
            if k in e:
                try: return float(e[k])
                except (TypeError, ValueError): return 0.0
        return 0.0

    def label_of(e):
        for k in ("name", "label", "month", "date"):
            if k in e:
                return str(e[k]).lower()
        return ""

    key = value_of if sort_by == "amount" else label_of
    fetched["data"] = sorted(data, key=key, reverse=reverse)


def build_chart_from_fetched(fetched: dict, intent: dict) -> dict | None:
    """Build a chart payload directly from fetched data."""
    if not fetched:
        return None

    qtype      = fetched.get("type", "")
    data       = fetched.get("data", [])
    chart_type = intent.get("chart_type") or _default_chart_type(qtype)
    title      = intent.get("chart_title") or _default_title(qtype, fetched)

    # Money flow uses nodes/links (not `data`) → handle before the empty-data guard.
    if qtype == "money_flow":
        return _build_money_flow(fetched, chart_type, title)

    if not data:
        return None

    # Category × month matrix → stacked bar / area / matrix heatmap.
    if qtype == "category_month_matrix":
        ct = chart_type if chart_type in ("stacked_bar", "stacked_area", "matrix_heatmap") else "stacked_bar"
        return {"type": ct, "title": title, "data": data,
                "categories": fetched.get("categories", []), "months": fetched.get("months", [])}

    # Individual transactions → scatter.
    if qtype == "transaction_points":
        return {"type": "scatter", "title": title, "data": data}

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

    # Aggregate 1-D series (month / category / merchant / day) — honor the
    # explicitly requested chart type; fall back to a sensible default per type.
    if qtype in _AGG_TYPES:
        if chart_type not in ("pie", "bar", "line", "table", "treemap", "radar"):
            chart_type = _default_chart_type(qtype)
        # Categories and merchants have no time order, so a line connecting them
        # implies a trend that doesn't exist. Compare them as bars instead.
        if chart_type == "line" and qtype in ("category_breakdown", "merchant_breakdown"):
            chart_type = "bar"
        return _shape_chart(_rows_to_pairs(qtype, data), chart_type, title)

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


# Aggregate 1-D series whose chart type the user may freely choose.
_AGG_TYPES = {
    "monthly_totals", "year_over_year",
    "category_breakdown", "merchant_breakdown", "daily_totals",
}


def _rows_to_pairs(qtype: str, data: list) -> list:
    """Normalise a fetched aggregate series into {label, value, month?, income?} pairs."""
    pairs = []
    if qtype in ("monthly_totals", "year_over_year"):
        for e in data:
            p = {"label": e.get("label", e.get("month", "")),
                 "month": e.get("month", ""),
                 "value": e.get("total", 0)}
            if e.get("income") is not None:
                p["income"] = e["income"]
            pairs.append(p)
    elif qtype == "daily_totals":
        for e in data:
            pairs.append({"label": e.get("date", ""), "value": e.get("amount", 0)})
    else:  # category_breakdown, merchant_breakdown → already {name, value}
        for e in data:
            pairs.append({"label": e.get("name", ""), "value": e.get("value", 0)})
    return pairs


def _shape_chart(pairs: list, chart_type: str, title: str) -> dict:
    """Reshape label/value pairs into the frontend's expected shape for the chart type."""
    # A line needs at least two points to draw a segment; one point renders an
    # empty plot. Downgrade rather than emit a chart the user can't read.
    if chart_type == "line" and len(pairs) < 2:
        chart_type = "bar"
    if chart_type == "line":
        data = []
        for p in pairs:
            row = {"month": p.get("month", ""), "label": p["label"], "total": p["value"]}
            if p.get("income") is not None:
                row["income"] = p["income"]
            data.append(row)
        return {"type": "line", "title": title, "data": data}
    if chart_type == "table":
        rows = [{"label": p["label"], "amount": round(float(p["value"]), 2)} for p in pairs]
        return {"type": "table", "title": title, "rows": rows, "columns": ["label", "amount"]}
    if chart_type == "radar":
        return {"type": "radar", "title": title,
                "data": [{"category": p["label"], "amount": p["value"]} for p in pairs]}
    # pie / bar / treemap all consume [{name, value}]
    data = [{"name": p["label"], "value": p["value"]} for p in pairs]
    return {"type": chart_type, "title": title, "data": data}


def _build_money_flow(fetched: dict, chart_type: str, title: str) -> dict | None:
    """money_flow fetch → sankey (default), waterfall, or gauge."""
    income = float(fetched.get("income", 0) or 0)
    nodes  = fetched.get("nodes", [])
    links  = fetched.get("links", [])
    ct = chart_type if chart_type in ("sankey", "waterfall", "gauge") else "sankey"

    if ct == "sankey":
        if not links:
            return None
        return {"type": "sankey", "title": title, "nodes": nodes, "links": links}

    # Category outflows = links leaving the Income node (index 0).
    cats = []
    for l in links:
        if l.get("source") == 0:
            tgt = l.get("target")
            name = nodes[tgt]["name"] if isinstance(tgt, int) and 0 <= tgt < len(nodes) else "?"
            cats.append({"name": name, "value": round(float(l.get("value", 0)), 2)})
    spent = round(sum(c["value"] for c in cats), 2)

    if ct == "gauge":
        return {"type": "gauge", "title": title, "value": spent,
                "max": max(income, spent) or 1.0,
                "label": f"Spent ${spent:,.0f} of ${income:,.0f} income"}

    # waterfall: income (+), each category (−), net
    wf = [{"name": "Income", "value": round(income, 2), "kind": "total"}]
    for c in cats:
        wf.append({"name": c["name"], "value": -c["value"], "kind": "out"})
    wf.append({"name": "Net", "value": round(income - spent, 2), "kind": "net"})
    return {"type": "waterfall", "title": title, "data": wf}


def _default_chart_type(qtype: str) -> str:
    return {
        "year_over_year": "line", "monthly_totals": "line",
        "category_breakdown": "pie", "merchant_breakdown": "treemap", "daily_totals": "bar",
        "calendar_heatmap": "heatmap", "transaction_search": "table",
        "category_month_matrix": "stacked_bar", "money_flow": "sankey",
        "transaction_points": "scatter",
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
    if qtype == "merchant_breakdown":
        return "Spending by Merchant"
    if qtype == "category_month_matrix":
        return "Spending by Category over Time"
    if qtype == "money_flow":
        return "Money Flow"
    if qtype == "transaction_points":
        return "Transactions"
    if qtype == "daily_totals":
        return f"Daily Spending — {fetched.get('month', '')}"
    if qtype == "calendar_heatmap":
        return f"{fetched.get('year', '')} Spending Calendar"
    if qtype == "transaction_search":
        kw = fetched.get("keyword", "")
        return f"Transactions: {kw}" if kw else "Transaction Search"
    return "Spending Chart"
