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
API_KEY_ENV_VAR = "GEMINI_API_KEY"


class GeminiClient:
    """Thin wrapper over the google-genai SDK for the single low-cost model."""

    def __init__(self, model: str = GEMINI_MODEL):
        self.model = model
        self._client = None

    def get_client(self):
        if self._client is None:
            try:
                from google import genai
            except ImportError as exc:
                raise ImportError(
                    "The 'google-genai' SDK is required. Run: pip install -r requirements.txt"
                ) from exc

            api_key = os.environ.get(API_KEY_ENV_VAR)
            if not api_key:
                raise RuntimeError(f"{API_KEY_ENV_VAR} is not set in .env")
            self._client = genai.Client(api_key=api_key)
        return self._client

    def generate_text(self, prompt: str, system_instruction: Optional[str] = None,
                      json_output: bool = False, temperature: float = 0.4) -> str:
        """Send one prompt and return the response text."""
        from google.genai import types

        config_args: dict[str, Any] = {"temperature": temperature}
        if system_instruction:
            config_args["system_instruction"] = system_instruction
        if json_output:
            config_args["response_mime_type"] = "application/json"

        logger.info("Calling %s (json=%s)", self.model, json_output)
        response = self.get_client().models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(**config_args),
        )
        return response.text or ""

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
