#!/bin/bash
set -e

OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

echo "[entrypoint] Waiting for Ollama..."
for i in $(seq 1 20); do
    if python3 -c "import urllib.request; urllib.request.urlopen('${OLLAMA_BASE_URL}/api/tags')" > /dev/null 2>&1; then
        echo "[entrypoint] Ollama is up."
        break
    fi
    echo "[entrypoint] Attempt $i/20 — retrying in 3s..."
    sleep 3
done

echo "[entrypoint] Building finara-gemma model..."
python3 /app/utils/build_model.py || echo "[entrypoint] Model build failed — falling back to gemma3:4b"

echo "[entrypoint] Starting gunicorn..."
exec gunicorn -w 2 --timeout 270 -b 0.0.0.0:8000 app:app
