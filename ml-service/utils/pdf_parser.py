"""
PDF Bank Statement Parser
Supports Bank of America, Chase, Wells Fargo, Citi and similar formats.
Returns: { transactions: [{date, description, amount, type}], summary, raw_text }
"""

import re
import pdfplumber
from datetime import datetime
from io import BytesIO


# ── Patterns ──────────────────────────────────────────────────────────────────

# Full transaction line:  MM/DD/YY  <description>  <amount>
TXN_RE = re.compile(
    r'^(\d{2}/\d{2}/\d{2,4})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s*$'
)

# Lines that are genuinely NOT transactions even if they contain a date+amount
BALANCE_PHRASES = [
    'beginning balance', 'ending balance',
    'total deposits', 'total atm', 'total other', 'total service',
    'total withdrawals', 'total subtractions',
    'new balance', 'previous balance',
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(raw: str) -> str:
    for fmt in ('%m/%d/%y', '%m/%d/%Y', '%m-%d-%Y'):
        try:
            return datetime.strptime(raw.strip(), fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return raw.strip()


def _parse_amount(raw: str) -> float:
    return float(raw.replace('$', '').replace(',', '').strip())


def _clean_description(desc: str) -> str:
    """
    Strip bank-statement noise from a transaction description.
    Keeps meaningful merchant/payee names.
    """
    # For ACH transactions: extract the DES: value as the core description
    des_match = re.search(r'\bDES:(\w+)', desc, re.IGNORECASE)
    if des_match:
        prefix = desc[:desc.lower().find('des:')].strip()
        core   = des_match.group(1)
        desc   = f"{core} ({prefix})" if prefix else core

    else:
        # Remove CHECKCARD / PURCHASE / PMNT SENT  + 4-digit date codes
        desc = re.sub(
            r'^(?:CHECKCARD|PURCHASE|PMNT\s+SENT|CHECK\s+CARD)\s+\d{4}\s+',
            '', desc, flags=re.IGNORECASE
        )
        # Remove ACH key=value fields (ID:, INDN:, CO ID:, PPD, CCD, WEB)
        desc = re.sub(r'\b(?:INDN|CO\s+ID|PPD|CCD|WEB):\S+', '', desc, flags=re.IGNORECASE)
        desc = re.sub(r'\bID:\S+', '', desc, flags=re.IGNORECASE)
        # Remove Conf# / Confirmation# tokens
        desc = re.sub(r'(?:Conf|Confirmation)#\s*\w+', '', desc, flags=re.IGNORECASE)
        # Remove bare # + alphanumeric (transaction reference IDs)
        desc = re.sub(r'#\w+', '', desc)
        # Remove long pure-numeric strings ≥ 7 digits (phone numbers, trace IDs)
        desc = re.sub(r'\b\d{7,}\b', '', desc)
        # Remove trailing noise words before stripping state codes
        desc = re.sub(r'\s+(?:RECURRING|RECUR)\s*$', '', desc, flags=re.IGNORECASE)
        # Remove trailing 2-letter US state abbreviations (now that RECURRING is gone)
        desc = re.sub(r'\s+[A-Z]{2}\s*$', '', desc)

    # Collapse whitespace and strip stray punctuation
    desc = re.sub(r'\s+', ' ', desc).strip().strip('*-;.,')
    return desc


def _is_balance_line(description: str) -> bool:
    """Returns True if the description is a running-balance or total row."""
    lower = description.lower()
    return any(p in lower for p in BALANCE_PHRASES)


# ── Line extractor ────────────────────────────────────────────────────────────

def _extract_transaction(line: str):
    """
    Try to extract a transaction from a single text line.
    Returns a dict or None.

    Key change from v1: if the line matches the date+desc+amount pattern,
    we accept it unconditionally — we do NOT re-filter on noise phrases so
    that real transactions like 'Bank of America DES:CASHREWARD' or
    'Monthly Maintenance Fee' are never dropped.
    """
    line = line.strip()
    if not line:
        return None

    m = TXN_RE.match(line)
    if not m:
        return None

    raw_date   = m.group(1)
    raw_desc   = m.group(2).strip()
    raw_amount = m.group(3)

    # Only skip confirmed balance/total rows
    if _is_balance_line(raw_desc):
        return None

    try:
        amount = _parse_amount(raw_amount)
        date   = _parse_date(raw_date)
        desc   = _clean_description(raw_desc)

        if len(desc) < 2:
            return None

        return {
            "date":        date,
            "description": desc,
            "amount":      amount,
            "type":        "CREDIT" if amount >= 0 else "DEBIT",
        }
    except (ValueError, TypeError):
        return None


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_pdf_statement(file_bytes: bytes) -> dict:
    """
    Parse a bank statement PDF and extract transactions.

    Returns:
    {
        "transactions": [
            { "date": "2026-03-11", "description": "STARBUCKS",
              "amount": -4.75, "type": "DEBIT" },
            ...
        ],
        "summary": { "period_start", "period_end", "total_deposits",
                     "total_withdrawals", "bank" },
        "raw_text": "..."
    }
    """
    transactions = []
    all_text     = []
    summary = {
        "period_start":    None,
        "period_end":      None,
        "total_deposits":  0.0,
        "total_withdrawals": 0.0,
        "bank":            "Unknown",
    }

    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            all_text.append(text)

            # Detect bank
            tl = text.lower()
            if "bank of america" in tl:
                summary["bank"] = "Bank of America"
            elif "chase" in tl:
                summary["bank"] = "Chase"
            elif "wells fargo" in tl:
                summary["bank"] = "Wells Fargo"
            elif "citibank" in tl or "citi " in tl:
                summary["bank"] = "Citibank"

            # Extract statement period
            if not summary["period_start"]:
                period_match = re.search(
                    r'(\w+ \d+,?\s*\d{4})\s+to\s+(\w+ \d+,?\s*\d{4})',
                    text, re.IGNORECASE
                )
                if period_match:
                    try:
                        start = datetime.strptime(
                            period_match.group(1).replace(',', '').strip(), '%B %d %Y'
                        ).strftime('%Y-%m-%d')
                        end = datetime.strptime(
                            period_match.group(2).replace(',', '').strip(), '%B %d %Y'
                        ).strftime('%Y-%m-%d')
                        summary["period_start"] = start
                        summary["period_end"]   = end
                    except Exception:
                        pass

            for line in text.split('\n'):
                txn = _extract_transaction(line)
                if txn:
                    transactions.append(txn)

    # Deduplicate on (date, first-30-chars-of-desc, amount)
    seen   = set()
    unique = []
    for t in transactions:
        key = (t['date'], t['description'][:30], t['amount'])
        if key not in seen:
            seen.add(key)
            unique.append(t)

    summary['total_deposits']    = round(sum(t['amount'] for t in unique if t['amount'] > 0), 2)
    summary['total_withdrawals'] = round(sum(abs(t['amount']) for t in unique if t['amount'] < 0), 2)

    return {
        "transactions": unique,
        "summary":      summary,
        "raw_text":     "\n---PAGE---\n".join(all_text),
    }


# ── Table-based fallback ──────────────────────────────────────────────────────

def parse_pdf_with_tables(file_bytes: bytes) -> dict:
    """
    Alternative parser using pdfplumber table extraction.
    Falls back to text parsing if no tables are found.
    """
    transactions = []
    summary = {
        "period_start": None, "period_end": None,
        "total_deposits": 0.0, "total_withdrawals": 0.0, "bank": "Unknown",
    }

    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if "bank of america" in text.lower():
                summary["bank"] = "Bank of America"

            for table in page.extract_tables():
                for row in table:
                    if not row or len(row) < 2:
                        continue
                    date_cell = desc_cell = amt_cell = None
                    for cell in row:
                        if cell is None:
                            continue
                        cell = str(cell).strip()
                        if re.match(r'^\d{2}/\d{2}/\d{2,4}$', cell):
                            date_cell = cell
                        elif re.match(r'^-?[\d,]+\.\d{2}$', cell):
                            amt_cell = cell
                        elif len(cell) > 3:
                            desc_cell = cell
                    if date_cell and desc_cell and amt_cell:
                        try:
                            amount = _parse_amount(amt_cell)
                            transactions.append({
                                "date":        _parse_date(date_cell),
                                "description": _clean_description(desc_cell),
                                "amount":      amount,
                                "type":        "CREDIT" if amount >= 0 else "DEBIT",
                            })
                        except (ValueError, TypeError):
                            pass

    if not transactions:
        return parse_pdf_statement(file_bytes)

    summary['total_deposits']    = round(sum(t['amount'] for t in transactions if t['amount'] > 0), 2)
    summary['total_withdrawals'] = round(sum(abs(t['amount']) for t in transactions if t['amount'] < 0), 2)
    return {"transactions": transactions, "summary": summary, "raw_text": ""}