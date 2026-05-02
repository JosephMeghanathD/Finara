import os
import re
import sys
import requests

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL_NAME      = os.getenv("GEMMA_MODEL", "finara-gemma")
MODELFILE_PATH  = "/app/Modelfile"


def parse_modelfile(content: str) -> dict:
    """Parse a Modelfile into the new Ollama /api/create request format."""
    payload = {"model": MODEL_NAME, "stream": False}

    # FROM line
    from_match = re.search(r"^FROM\s+(\S+)", content, re.MULTILINE | re.IGNORECASE)
    if from_match:
        payload["from"] = from_match.group(1)

    # SYSTEM block — handles both triple-quoted and single-quoted forms
    system_match = re.search(
        r'SYSTEM\s+"""(.*?)"""', content, re.DOTALL | re.IGNORECASE
    ) or re.search(
        r'SYSTEM\s+"(.*?)"', content, re.DOTALL | re.IGNORECASE
    )
    if system_match:
        payload["system"] = system_match.group(1).strip()

    # PARAMETER lines  e.g. "PARAMETER temperature 0.45"
    params = {}
    for m in re.finditer(r"^PARAMETER\s+(\S+)\s+(\S+)", content, re.MULTILINE | re.IGNORECASE):
        key, val = m.group(1), m.group(2)
        try:
            params[key] = float(val) if "." in val else int(val)
        except ValueError:
            params[key] = val
    if params:
        payload["parameters"] = params

    return payload


def build_model():
    if not os.path.exists(MODELFILE_PATH):
        print(f"[build_model] Modelfile not found at {MODELFILE_PATH} — skipping")
        return

    with open(MODELFILE_PATH) as f:
        modelfile_content = f.read()

    payload = parse_modelfile(modelfile_content)
    print(f"[build_model] Creating '{MODEL_NAME}' (from: {payload.get('from', '?')})...")

    resp = requests.post(
        f"{OLLAMA_BASE_URL}/api/create",
        json=payload,
        timeout=120,
    )
    if not resp.ok:
        raise RuntimeError(f"Ollama create failed: {resp.status_code} {resp.text}")

    print(f"[build_model] Model '{MODEL_NAME}' ready.")


if __name__ == "__main__":
    try:
        build_model()
    except Exception as e:
        print(f"[build_model] ERROR: {e}")
        sys.exit(1)
