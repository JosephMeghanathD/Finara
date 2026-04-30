# 🏦 Finara — The AI Financial Storyteller

> Transform raw transaction data into personalized financial narratives powered by local Gemma AI.

## Architecture

```
finara/
├── backend/          # Java 17 + Spring Boot 3 (REST API + Orchestrator)
├── frontend/         # React 18 (UI)
└── ml-service/       # Python + Flask + Gemma (ML + AI Narrative)
```

## Use Cases (12 Core Features)

### Basic
1. **Upload Spending Data** — CSV upload from bank/credit card
2. **View Top Spending Areas** — Visual chart of spending categories
3. **Compare Spending Over Time** — Side-by-side monthly comparison

### Machine Learning
4. **Auto-Categorize Transactions** — ML sorts messy merchant names
5. **Spot Unusual Purchases** — Anomaly detection flags odd transactions
6. **Predict Future Spending** — Time-series forecast for next month
7. **Budget Vs. Actual Tracker** — Compare planned vs real spending

### AI / Gemma (SLM)
8. **Monthly Financial Story** — Gemma narrates your spending in plain English
9. **Ask "Why?" About Anomalies** — Natural language explanation of flagged items
10. **Smart Savings Plan Generator** — Goal-based AI spending plan
11. **Savings Goal Reality Check** — AI evaluates if your goal is achievable
12. **Interactive Financial Q&A** — Chat with Gemma about your own data
13. **Merchant Insight Explainer** — AI explains what an unknown merchant is
14. **Spending Habit Coach** — Weekly AI tips based on patterns

## Quick Start

### 1. ML Service (Python + Gemma)
```bash
cd ml-service
pip install -r requirements.txt
# Pull Gemma via Ollama
ollama pull gemma3:4b
python app.py
# Runs on http://localhost:8000
```

### 2. Backend (Java Spring Boot)
```bash
cd backend
# Set up PostgreSQL and update application.properties
./mvnw spring-boot:run
# Runs on http://localhost:8080
```

### 3. Frontend (React)
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

## Environment Variables

### Backend (`application.properties`)
```
spring.datasource.url=jdbc:postgresql://localhost:5432/finara
spring.datasource.username=postgres
spring.datasource.password=your_password
ml.service.url=http://localhost:8000
jwt.secret=your_jwt_secret_here
```

### ML Service (`.env`)
```
OLLAMA_BASE_URL=http://localhost:11434
GEMMA_MODEL=gemma3:4b
```
