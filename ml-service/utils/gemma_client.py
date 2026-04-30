"""
Gemma client — wraps Ollama local API
All narrative/AI features call through here
"""

import os
import re
import requests
import json

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
GEMMA_MODEL     = os.getenv("GEMMA_MODEL", "gemma3:4b")

# Match the host's physical core count
NUM_THREAD = int(os.getenv("OLLAMA_NUM_THREAD", "8"))


def _base_options(temperature: float, num_ctx: int, num_predict: int) -> dict:
    return {
        "temperature":    temperature,
        "num_thread":     NUM_THREAD,
        "num_ctx":        num_ctx,
        "num_predict":    num_predict,
        "repeat_penalty": 1.1,
        "top_p":          0.9,
        "top_k":          40,
    }


def ask_gemma(
    prompt: str,
    system: str = None,
    temperature: float = 0.7,
    num_ctx: int = 1536,
    num_predict: int = 400,
) -> str:
    """
    Send a prompt to the local Gemma model via Ollama.
    num_ctx:     context window — keep small for speed (1024 for short tasks)
    num_predict: max tokens to generate — always cap this
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model":      GEMMA_MODEL,
        "messages":   messages,
        "stream":     False,
        "keep_alive": -1,
        "options":    _base_options(temperature, num_ctx, num_predict),
    }

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=180
        )
        if not resp.ok:
            try:
                detail = resp.json().get("error", resp.text)
            except Exception:
                detail = resp.text
            raise RuntimeError(f"Ollama error ({resp.status_code}): {detail}")
        return resp.json()["message"]["content"].strip()
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Cannot reach Ollama. Make sure it is running: `ollama serve`")
    except requests.exceptions.Timeout:
        raise RuntimeError("Gemma request timed out after 3 minutes.")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Gemma error: {str(e)}")


def ask_gemma_chat(
    messages: list,
    temperature: float = 0.7,
    num_ctx: int = 2048,
    num_predict: int = 400,
) -> str:
    """
    Multi-turn chat with a pre-built messages list (system + history + user).
    Uses the same performance options as ask_gemma.
    """
    payload = {
        "model":      GEMMA_MODEL,
        "messages":   messages,
        "stream":     False,
        "keep_alive": -1,
        "options":    _base_options(temperature, num_ctx, num_predict),
    }

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=180
        )
        if not resp.ok:
            try:
                detail = resp.json().get("error", resp.text)
            except Exception:
                detail = resp.text
            raise RuntimeError(f"Ollama error ({resp.status_code}): {detail}")
        return resp.json()["message"]["content"].strip()
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Cannot reach Ollama.")
    except requests.exceptions.Timeout:
        raise RuntimeError("Gemma request timed out after 3 minutes.")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Gemma error: {str(e)}")


def ask_gemma_json(
    prompt: str,
    system: str = None,
    num_ctx: int = 1024,
    num_predict: int = 280,
) -> dict:
    """
    Ask Gemma and parse the response as JSON.
    Uses Ollama's format:json mode to guarantee valid JSON output.
    Falls back to regex extraction if the model still wraps output in prose.
    """
    json_system = (system or "") + "\nRespond ONLY with a valid JSON object. No markdown, no explanation, no text outside the JSON."

    messages = []
    if json_system.strip():
        messages.append({"role": "system", "content": json_system.strip()})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model":      GEMMA_MODEL,
        "messages":   messages,
        "stream":     False,
        "keep_alive": -1,
        "format":     "json",
        "options":    _base_options(0.2, num_ctx, num_predict),
    }

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=180,
        )
        if not resp.ok:
            raise RuntimeError(f"Ollama error ({resp.status_code}): {resp.text}")

        raw = resp.json()["message"]["content"].strip()

        # Strip markdown fences in case the model still wraps output
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        raw = raw.strip()

        # Extract the first complete {...} object if there's surrounding prose
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)

        return json.loads(raw)

    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemma returned invalid JSON: {e} — raw: {raw[:200]}")
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Cannot reach Ollama. Make sure it is running.")
    except requests.exceptions.Timeout:
        raise RuntimeError("Gemma request timed out after 3 minutes.")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Gemma JSON error: {str(e)}")
