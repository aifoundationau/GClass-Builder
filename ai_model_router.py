"""
Gemini client for Google Course Builder.

Every AI call in the app uses one low-cost model. Cost is the priority, so there
is no per-task model routing and no reasoning tier.
"""

import os
import json
import logging
from typing import Optional, Any

logger = logging.getLogger("model_router")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [AI] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Low-cost Gemini model used for every AI feature in the app.
GEMINI_MODEL = "gemini-3.5-flash-lite"
FALLBACK_MODEL = "gemini-2.5-flash"
API_KEY_ENV_VAR = "GEMINI_API_KEY"


def _load_env() -> None:
    env_file = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.isfile(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip('"\'')
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass


_load_env()


class GeminiAuthError(RuntimeError):
    """Raised when the Gemini API key is missing, invalid, or unauthorized."""
    pass


class GeminiClient:
    """Thin wrapper over the google-genai SDK for the single low-cost model."""

    def __init__(self, model: str = GEMINI_MODEL):
        self.model = model
        self._client = None

    def get_api_key(self) -> str:
        """Resolve and validate the Gemini API key from the environment."""
        key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip().strip('"\'')
        if not key:
            raise GeminiAuthError(
                "GEMINI_API_KEY is not set in .env. "
                "Please get an API key from Google AI Studio (https://aistudio.google.com/app/apikey) "
                "and set GEMINI_API_KEY=<your-key> in your .env file."
            )
        if key.startswith("AQ."):
            raise GeminiAuthError(
                "GEMINI_API_KEY in .env starts with 'AQ.', which is not a valid Gemini API key. "
                "Gemini API keys start with 'AIzaSy'. Please generate a valid key from "
                "https://aistudio.google.com/app/apikey and update GEMINI_API_KEY in .env."
            )
        return key

    def get_client(self):
        if self._client is None:
            try:
                from google import genai
            except ImportError as exc:
                raise ImportError(
                    "The 'google-genai' SDK is required. Run: pip install -r requirements.txt"
                ) from exc

            api_key = self.get_api_key()
            os.environ["GEMINI_API_KEY"] = api_key
            if os.environ.get("GOOGLE_API_KEY") and os.environ.get("GOOGLE_API_KEY") != api_key:
                os.environ["GOOGLE_API_KEY"] = api_key
            self._client = genai.Client(api_key=api_key)
        return self._client

    def generate_text(self, prompt: str, system_instruction: Optional[str] = None,
                      json_output: bool = False, temperature: float = 0.4) -> str:
        """Send one prompt and return the response text."""
        from google.genai import types
        from google.genai.errors import ClientError, APIError

        config_args: dict[str, Any] = {"temperature": temperature}
        if system_instruction:
            config_args["system_instruction"] = system_instruction
        if json_output:
            config_args["response_mime_type"] = "application/json"

        logger.info("Calling %s (json=%s)", self.model, json_output)
        client = self.get_client()

        for target_model in (self.model, FALLBACK_MODEL):
            try:
                response = client.models.generate_content(
                    model=target_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(**config_args),
                )
                return response.text or ""
            except ClientError as exc:
                err_str = str(exc)
                if "401" in err_str or "UNAUTHENTICATED" in err_str:
                    raise GeminiAuthError(
                        "Gemini API key is invalid or unauthenticated (401 UNAUTHENTICATED). "
                        "Please verify your key at https://aistudio.google.com/app/apikey and update GEMINI_API_KEY in .env."
                    ) from exc
                if "403" in err_str or "PERMISSION_DENIED" in err_str:
                    raise GeminiAuthError(
                        "Gemini API permission denied (403): The API key is blocked from accessing generativelanguage.googleapis.com. "
                        "Please check API restrictions in Google Cloud Console or create a new key in Google AI Studio."
                    ) from exc
                if ("404" in err_str or "NOT_FOUND" in err_str) and target_model != FALLBACK_MODEL:
                    logger.warning("Model %s not found, trying fallback %s", target_model, FALLBACK_MODEL)
                    continue
                raise
            except APIError as exc:
                logger.error("Gemini API error: %s", exc)
                raise

        return ""

    def generate_json(self, prompt: str, system_instruction: Optional[str] = None) -> Any:
        """Send a prompt that must return JSON and return the parsed object."""
        text = self.generate_text(prompt, system_instruction=system_instruction, json_output=True)
        return json.loads(text)


_CLIENT: Optional[GeminiClient] = None


def get_gemini_client() -> GeminiClient:
    """Return the shared client."""
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = GeminiClient()
    return _CLIENT
