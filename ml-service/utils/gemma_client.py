"""
LLM client — provider-agnostic wrapper for all narrative/AI features.

Two backends, selected at runtime by the LLM_PROVIDER env var:
  - "ollama" (default): local Gemma via Ollama (containerized or host)
  - "google":           Gemini via Google's Generative Language API (needs GOOGLE_API_KEY)

Every route calls the same three public functions regardless of provider:
  ask_gemma(prompt, system=..., ...)      -> str
  ask_gemma_chat(messages, ...)           -> str
  ask_gemma_json(prompt, system=..., ...) -> dict
"""

import os
import re
import json
import requests

# ── Provider selection ────────────────────────────────────────────────────────
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").strip().lower()

# ── Ollama (local) config ─────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
GEMMA_MODEL     = os.getenv("GEMMA_MODEL", "finara-gemma")
NUM_THREAD      = int(os.getenv("OLLAMA_NUM_THREAD", "8"))  # host physical core count

# ── Google (Gemini) config ────────────────────────────────────────────────────
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_MODEL   = os.getenv("GOOGLE_MODEL", "gemini-2.5-flash")
GOOGLE_API_BASE = os.getenv(
    "GOOGLE_API_BASE", "https://generativelanguage.googleapis.com/v1beta"
)

REQUEST_TIMEOUT = 250  # seconds — Gemma on CPU is slow

# Behavioral system prompt. Baked into the finara-gemma Modelfile for the Ollama
# path; applied here so the Google path behaves identically when a route does not
# supply its own system prompt. Keep in sync with ml-service/Modelfile.
FINARA_BASE_SYSTEM = """You are Finara, a personal finance AI advisor embedded in the Finara app.

RULES YOU MUST FOLLOW:
1. Always cite the exact dollar figures provided to you. Never invent numbers.
2. Never do arithmetic yourself — all calculations are done before they reach you. Trust the numbers in the prompt.
3. Keep responses concise: 2-3 sentences for explanations, 3 paragraphs for stories, JSON-only when the prompt says JSON.
4. Be direct and honest. If spending looks unhealthy, say so plainly. Don't hedge.
5. Use plain English. No financial jargon unless the user used it first.
6. End advice with one actionable step the user can take today or this week.
7. Never suggest contacting a financial advisor as a primary recommendation — you ARE the advisor.
8. When a prompt gives you historical context (6-month averages, trends), you MUST reference it."""


# ══════════════════════════════════════════════════════════════════════════════
# Ollama backend
# ══════════════════════════════════════════════════════════════════════════════

def _ollama_options(temperature: float, num_ctx: int, num_predict: int) -> dict:
    return {
        "temperature":    temperature,
        "num_thread":     NUM_THREAD,
        "num_ctx":        num_ctx,
        "num_predict":    num_predict,
        "repeat_penalty": 1.15,
        "top_p":          0.88,
        "top_k":          35,
    }


def _ollama_complete(messages, temperature, num_ctx, num_predict, as_json) -> str:
    payload = {
        "model":      GEMMA_MODEL,
        "messages":   messages,
        "stream":     False,
        "keep_alive": -1,
        "options":    _ollama_options(temperature, num_ctx, num_predict),
    }
    if as_json:
        payload["format"] = "json"

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=REQUEST_TIMEOUT
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
        raise RuntimeError("Gemma request timed out after ~4 minutes.")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Ollama error: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# Google Gemini backend
# ══════════════════════════════════════════════════════════════════════════════

def _google_complete(messages, temperature, num_ctx, num_predict, as_json) -> str:
    if not GOOGLE_API_KEY:
        raise RuntimeError(
            "LLM_PROVIDER=google but GOOGLE_API_KEY is not set. "
            "Get a key at https://aistudio.google.com/apikey and set GOOGLE_API_KEY."
        )

    # Split the role-tagged messages into a Gemini systemInstruction + contents.
    # Gemini uses roles "user"/"model" (not "assistant") and no inline system role.
    system_parts = []
    contents = []
    for m in messages:
        role, text = m.get("role"), m.get("content", "")
        if role == "system":
            system_parts.append(text)
        else:
            g_role = "model" if role == "assistant" else "user"
            contents.append({"role": g_role, "parts": [{"text": text}]})

    # No route-supplied system → fall back to Finara's baseline behavior,
    # matching the finara-gemma Modelfile default on the Ollama path.
    system_text = "\n\n".join(p for p in system_parts if p).strip() or FINARA_BASE_SYSTEM

    gen_config = {
        "temperature":     temperature,
        "maxOutputTokens": num_predict,
        "topP":            0.88,
        "topK":            35,
    }
    if as_json:
        gen_config["responseMimeType"] = "application/json"

    payload = {
        "systemInstruction": {"parts": [{"text": system_text}]},
        "contents":          contents,
        "generationConfig":  gen_config,
    }

    url = f"{GOOGLE_API_BASE}/models/{GOOGLE_MODEL}:generateContent"
    try:
        resp = requests.post(
            url,
            params={"key": GOOGLE_API_KEY},
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        if not resp.ok:
            try:
                detail = resp.json().get("error", {}).get("message", resp.text)
            except Exception:
                detail = resp.text
            raise RuntimeError(f"Gemini error ({resp.status_code}): {detail}")

        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            reason = data.get("promptFeedback", {}).get("blockReason", "no candidates")
            raise RuntimeError(f"Gemini returned no content ({reason}).")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts).strip()
        if not text:
            finish = candidates[0].get("finishReason", "unknown")
            raise RuntimeError(f"Gemini returned empty text (finishReason={finish}).")
        return text
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Cannot reach Google Generative Language API (network error).")
    except requests.exceptions.Timeout:
        raise RuntimeError("Gemini request timed out.")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Gemini error: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# Provider dispatch
# ══════════════════════════════════════════════════════════════════════════════

def _complete(messages, temperature, num_ctx, num_predict, as_json=False) -> str:
    if LLM_PROVIDER == "google":
        return _google_complete(messages, temperature, num_ctx, num_predict, as_json)
    if LLM_PROVIDER == "ollama":
        return _ollama_complete(messages, temperature, num_ctx, num_predict, as_json)
    raise RuntimeError(
        f"Unknown LLM_PROVIDER '{LLM_PROVIDER}'. Use 'ollama' or 'google'."
    )


# ══════════════════════════════════════════════════════════════════════════════
# Public API (unchanged signatures — routes call these)
# ══════════════════════════════════════════════════════════════════════════════

def ask_gemma(
    prompt: str,
    system: str = None,
    temperature: float = 0.7,
    num_ctx: int = 1536,
    num_predict: int = 400,
) -> str:
    """
    Single-turn completion.
    num_ctx:     context window (Ollama only; ignored by Google). Keep small for speed.
    num_predict: max tokens to generate — always cap this.
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return _complete(messages, temperature, num_ctx, num_predict)


def ask_gemma_chat(
    messages: list,
    temperature: float = 0.7,
    num_ctx: int = 2048,
    num_predict: int = 400,
) -> str:
    """
    Multi-turn chat with a pre-built messages list (system + history + user).
    Message roles: 'system' | 'user' | 'assistant'.
    """
    return _complete(messages, temperature, num_ctx, num_predict)


def ask_gemma_json(
    prompt: str,
    system: str = None,
    num_ctx: int = 1024,
    num_predict: int = 280,
) -> dict:
    """
    Ask the model and parse the response as JSON. Uses the provider's native
    JSON mode (Ollama format:json / Gemini responseMimeType) and falls back to
    regex extraction if the model still wraps output in prose.
    """
    json_system = (system or "") + (
        "\nRespond ONLY with a valid JSON object. "
        "No markdown, no explanation, no text outside the JSON."
    )

    messages = []
    if json_system.strip():
        messages.append({"role": "system", "content": json_system.strip()})
    messages.append({"role": "user", "content": prompt})

    raw = _complete(messages, 0.2, num_ctx, num_predict, as_json=True)

    # Strip markdown fences and extract the first complete {...} object.
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        cleaned = match.group(0)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Model returned invalid JSON: {e} — raw: {raw[:200]}")
