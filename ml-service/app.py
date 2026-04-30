"""
Finara ML Service
Exposes ML models + Gemma AI via Flask REST API
"""

from flask import Flask, jsonify
from flask_cors import CORS
from routes.categorize import categorize_bp
from routes.anomaly import anomaly_bp
from routes.forecast import forecast_bp
from routes.narrative import narrative_bp
from routes.savings import savings_bp
from routes.insights import insights_bp
from routes.pdf import pdf_bp

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

@app.route("/health")
def health():
    return {"status": "ok", "service": "finara-ml"}

@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
