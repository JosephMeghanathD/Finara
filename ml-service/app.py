"""
Finara ML Service
Exposes ML models + Gemma AI via Flask REST API
"""
import os
from flask import Flask, jsonify
from flask_cors import CORS
from routes.categorize import categorize_bp
from routes.anomaly import anomaly_bp
from routes.forecast import forecast_bp
from routes.narrative import narrative_bp
from routes.savings import savings_bp
from routes.insights import insights_bp
from routes.pdf import pdf_bp
from routes.stocks import stocks_bp

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

app = Flask(__name__)
CORS(app)

# Register blueprints
app.register_blueprint(categorize_bp, url_prefix="/api/ml")
app.register_blueprint(anomaly_bp,    url_prefix="/api/ml")
app.register_blueprint(forecast_bp,   url_prefix="/api/ml")
app.register_blueprint(pdf_bp,        url_prefix="/api/ml")
app.register_blueprint(narrative_bp,  url_prefix="/api/ai")
app.register_blueprint(savings_bp,    url_prefix="/api/ai")
app.register_blueprint(insights_bp,   url_prefix="/api/ai")
app.register_blueprint(stocks_bp,     url_prefix="/api/stocks")

@app.route("/health")
def health():
    """Report the ACTIVE LLM provider (google or ollama), not a hardcoded one."""
    import requests as req_lib
    provider = os.getenv("LLM_PROVIDER", "ollama").strip().lower()

    if provider == "google":
        model   = os.getenv("GOOGLE_MODEL", "gemini-2.5-flash")
        has_key = bool(os.getenv("GOOGLE_API_KEY"))
        llm = {
            "provider": "google",
            "name":     "Google Gemini",
            "status":   "up" if has_key else "down",
            "detail":   model if has_key else "GOOGLE_API_KEY not set",
        }
    else:
        model  = os.getenv("GEMMA_MODEL", "finara-gemma")
        status, detail = "down", None
        try:
            r = req_lib.get(OLLAMA_BASE_URL, timeout=8)
            if r.status_code == 200:
                status = "up"
                try:
                    tags   = req_lib.get(OLLAMA_BASE_URL + "/api/tags", timeout=5)
                    models = [m["name"] for m in tags.json().get("models", [])]
                    detail = model if model in models else (models[0] if models else "no model loaded")
                except Exception:
                    detail = "running"
            else:
                detail = f"HTTP {r.status_code}"
        except Exception as e:
            detail = str(e)[:80]
        llm = {"provider": "ollama", "name": "Ollama", "status": status, "detail": detail}

    overall = "ok" if llm["status"] == "up" else "degraded"
    return jsonify({
        "status":  overall,
        "service": "finara-ml",
        "llm":     llm,
    })

@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
