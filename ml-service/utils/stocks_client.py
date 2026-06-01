"""
Shared yfinance helpers for stocks routes + chat injection.
"""
import logging
import re
import yfinance as yf

logger = logging.getLogger(__name__)

MERCHANT_TICKERS = {
    "amazon": "AMZN", "amzn": "AMZN", "whole foods": "AMZN",
    "apple": "AAPL", "itunes": "AAPL", "apple.com": "AAPL",
    "netflix": "NFLX",
    "spotify": "SPOT",
    "starbucks": "SBUX",
    "walmart": "WMT",
    "target": "TGT",
    "costco": "COST",
    "uber": "UBER", "ubereats": "UBER", "uber eats": "UBER",
    "lyft": "LYFT",
    "doordash": "DASH",
    "instacart": "CART",
    "chipotle": "CMG",
    "mcdonald": "MCD",
    "google": "GOOGL", "youtube": "GOOGL",
    "microsoft": "MSFT", "xbox": "MSFT",
    "meta": "META", "facebook": "META", "instagram": "META",
    "disney": "DIS", "disney+": "DIS", "hulu": "DIS",
    "airbnb": "ABNB",
    "delta": "DAL",
    "united airlines": "UAL",
    "american airlines": "AAL",
    "southwest": "LUV",
    "hilton": "HLT",
    "marriott": "MAR",
    "cvs": "CVS",
    "walgreens": "WBA",
    "nike": "NKE",
    "lululemon": "LULU",
    "kroger": "KR",
    "albertsons": "ACI",
    "home depot": "HD",
    "lowes": "LOW", "lowe's": "LOW",
    "best buy": "BBY",
    "chewy": "CHWY",
    "etsy": "ETSY",
    "ebay": "EBAY",
    "paypal": "PYPL", "venmo": "PYPL",
    "coinbase": "COIN",
    "peloton": "PTON",
    "tesla": "TSLA",
    "nvidia": "NVDA",
}

CATEGORY_ETFS = {
    "Food & Drink":    ("XLP", "Consumer Staples"),
    "Groceries":       ("XLP", "Consumer Staples"),
    "Shopping":        ("XLY", "Consumer Discretionary"),
    "Transport":       ("XLI", "Industrials"),
    "Travel":          ("XLI", "Industrials"),
    "Healthcare":      ("XLV", "Healthcare"),
    "Entertainment":   ("XLC", "Comm. Services"),
    "Subscriptions":   ("XLC", "Comm. Services"),
    "Financial":       ("XLF", "Financials"),
    "Utilities":       ("XLU", "Utilities"),
}

INDICES = [
    ("^GSPC", "S&P 500"),
    ("^IXIC", "NASDAQ"),
    ("^DJI",  "Dow Jones"),
    ("^VIX",  "VIX"),
]

# Known ticker symbols for chat detection
_KNOWN_TICKERS = {
    "AAPL", "AMZN", "MSFT", "GOOGL", "META", "NFLX", "TSLA", "NVDA",
    "SBUX", "MCD", "CMG", "WMT", "TGT", "COST", "HD", "LOW",
    "UBER", "LYFT", "DASH", "ABNB", "DAL", "UAL", "AAL", "LUV",
    "PYPL", "COIN", "SPOT", "DIS", "PTON", "LULU", "NKE",
    "SPY", "QQQ", "^GSPC", "^IXIC", "^DJI",
}

_STOCK_KEYWORDS = [
    "stock", "stocks", "ticker", "share", "shares", "invest",
    "portfolio", "market", "s&p", "nasdaq", "dow", "equity",
    "dividend", "etf", "ipo", "bull", "bear", "rally", "earnings",
]

# Pre-compiled regex: 1-5 uppercase letters possibly preceded by $
_TICKER_RE = re.compile(r'\$([A-Z]{1,5})\b|\b([A-Z]{2,5})\b')


def get_quote(ticker: str) -> dict | None:
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="5d")
        if hist.empty:
            return None
        prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else float(hist["Close"].iloc[-1])
        curr = float(hist["Close"].iloc[-1])
        chg  = ((curr - prev) / prev * 100) if prev else 0
        return {
            "ticker":     ticker,
            "price":      round(curr, 2),
            "change_pct": round(chg, 2),
            "prev_close": round(prev, 2),
        }
    except Exception as e:
        logger.debug("yfinance error %s: %s", ticker, e)
        return None


def get_market_overview() -> list[dict]:
    results = []
    for sym, label in INDICES:
        q = get_quote(sym)
        if q:
            q["label"] = label
            results.append(q)
    return results


def detect_stock_intent(message: str) -> list[str]:
    """Return list of tickers referenced in message (explicit or via brand name)."""
    msg_lower = message.lower()
    tickers = set()

    # Keyword → lookup brand names
    for kw, ticker in MERCHANT_TICKERS.items():
        if kw in msg_lower:
            tickers.add(ticker)

    # Explicit ticker symbols ($AAPL or AAPL)
    for m in _TICKER_RE.finditer(message):
        sym = (m.group(1) or m.group(2)).upper()
        if sym in _KNOWN_TICKERS:
            tickers.add(sym)

    return list(tickers)


def has_stock_intent(message: str) -> bool:
    msg_lower = message.lower()
    if any(kw in msg_lower for kw in _STOCK_KEYWORDS):
        return True
    return len(detect_stock_intent(message)) > 0


def build_stock_context_text(message: str) -> str:
    """Fetch relevant stock data for a chat message and return a formatted string."""
    tickers = detect_stock_intent(message)
    msg_lower = message.lower()

    lines = []

    # Market overview if generic market question
    market_kws = ["market", "s&p", "nasdaq", "dow", "indices", "index"]
    if any(kw in msg_lower for kw in market_kws) or not tickers:
        indices = get_market_overview()
        if indices:
            lines.append("=== Current Market Indices ===")
            for idx in indices:
                direction = "▲" if idx["change_pct"] >= 0 else "▼"
                lines.append(f"  {idx['label']}: ${idx['price']:,.2f}  {direction}{abs(idx['change_pct']):.2f}%")

    # Specific tickers
    if tickers:
        lines.append("=== Stock Quotes ===")
        for ticker in tickers[:5]:
            q = get_quote(ticker)
            if q:
                direction = "▲" if q["change_pct"] >= 0 else "▼"
                lines.append(f"  {q['ticker']}: ${q['price']:,.2f}  {direction}{abs(q['change_pct']):.2f}% (prev close ${q['prev_close']:,.2f})")

    return "\n".join(lines)
