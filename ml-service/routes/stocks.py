"""
Route: /api/stocks
Live stock data + merchant matching for Finara's Invest Instead page.
"""
import logging
import yfinance as yf
from flask import Blueprint, request, jsonify
from utils.stocks_client import (
    MERCHANT_TICKERS, CATEGORY_ETFS, INDICES,
    get_quote, get_market_overview,
)

logger = logging.getLogger(__name__)
stocks_bp = Blueprint("stocks", __name__)


@stocks_bp.route("/market", methods=["GET"])
def market_overview():
    """GET /api/stocks/market — S&P 500, NASDAQ, Dow Jones, VIX"""
    indices = get_market_overview()
    return jsonify({"indices": indices})


@stocks_bp.route("/quote", methods=["GET"])
def quote():
    """GET /api/stocks/quote?symbols=AAPL,SBUX,AMZN"""
    symbols = request.args.get("symbols", "")
    tickers = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    results = []
    for t in tickers[:10]:
        q = get_quote(t)
        if q:
            results.append(q)
    return jsonify({"quotes": results})


@stocks_bp.route("/match-merchants", methods=["POST"])
def match_merchants():
    """POST /api/stocks/match-merchants
    Body: { merchants: [{name, total_spent}] }
    Returns matched tickers with stock data + invest-instead calculation.
    """
    data      = request.get_json() or {}
    merchants = data.get("merchants", [])
    matched   = []
    seen      = set()

    for m in merchants:
        name  = (m.get("name") or "").lower()
        spent = float(m.get("total_spent") or 0)

        ticker = None
        for kw, t in MERCHANT_TICKERS.items():
            if kw in name:
                ticker = t
                break

        if not ticker or ticker in seen:
            continue
        seen.add(ticker)

        q = get_quote(ticker)
        if not q:
            continue

        # 1-year return for invest-instead projection
        annual_return = 0.08  # fallback
        try:
            hist = yf.Ticker(ticker).history(period="1y")
            if len(hist) >= 2:
                p0 = float(hist["Close"].iloc[0])
                p1 = float(hist["Close"].iloc[-1])
                annual_return = (p1 - p0) / p0 if p0 else 0.08
        except Exception:
            pass

        total_invested = spent * 12
        value_now      = total_invested * (1 + annual_return)
        gain           = value_now - total_invested

        matched.append({
            **q,
            "merchant_name":    m.get("name"),
            "monthly_spent":    round(spent, 2),
            "annual_return_pct": round(annual_return * 100, 2),
            "invest_instead": {
                "total_invested": round(total_invested, 2),
                "value_now":      round(value_now, 2),
                "gain":           round(gain, 2),
            },
        })

    return jsonify({"matches": matched})


@stocks_bp.route("/sector-etfs", methods=["POST"])
def sector_etfs():
    """POST /api/stocks/sector-etfs
    Body: { categories: { "Food & Drink": 420.0, ... } }
    Returns ETF data for the user's top spending categories.
    """
    data       = request.get_json() or {}
    categories = data.get("categories", {})
    results    = []
    seen_etfs  = set()

    for cat, amt in sorted(categories.items(), key=lambda x: -float(x[1])):
        if cat not in CATEGORY_ETFS:
            continue
        etf_ticker, etf_label = CATEGORY_ETFS[cat]
        if etf_ticker in seen_etfs:
            continue
        seen_etfs.add(etf_ticker)
        q = get_quote(etf_ticker)
        if not q:
            continue
        results.append({
            **q,
            "label":          etf_label,
            "category":       cat,
            "category_spend": round(float(amt), 2),
        })
        if len(results) >= 4:
            break

    return jsonify({"sector_etfs": results})
