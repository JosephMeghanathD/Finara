"""
Route: /api/ml/parse-pdf
Accepts a bank statement PDF, extracts transactions, and returns them
in the same format as a CSV upload so the Java backend can process them identically.
"""

from flask import Blueprint, request, jsonify
from utils.pdf_parser import parse_pdf_statement, parse_pdf_with_tables

pdf_bp = Blueprint("pdf", __name__)


@pdf_bp.route("/parse-pdf", methods=["POST"])
def parse_pdf():
    """
    Input:  multipart/form-data with field "file" (PDF)
    Output:
    {
      "transactions": [
        { "date": "2026-03-11", "description": "DD *DOORDASH JIMM", "amount": 19.06 },
        ...
      ],
      "summary": {
        "period_start": "2026-03-10",
        "period_end":   "2026-04-08",
        "total_deposits":    9508.15,
        "total_withdrawals": 8126.01,
        "bank": "Bank of America"
      },
      "count": 14
    }
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "File must be a PDF"}), 400

    file_bytes = file.read()
    if len(file_bytes) == 0:
        return jsonify({"error": "Empty file"}), 400

    try:
        # Try table extraction first, fall back to text parsing
        result = parse_pdf_with_tables(file_bytes)

        if not result["transactions"]:
            return jsonify({
                "error":   "No transactions found in PDF",
                "message": "Make sure this is a bank statement PDF with transaction data",
                "bank":    result["summary"].get("bank", "Unknown"),
            }), 422

        return jsonify({
            "transactions": result["transactions"],
            "summary":      result["summary"],
            "count":        len(result["transactions"]),
        })

    except Exception as e:
        return jsonify({"error": f"Failed to parse PDF: {str(e)}"}), 500
