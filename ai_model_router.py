"""
Standard AI Model Router Service for Google Course Builder.
Implements dynamic model routing across Gemini 3 tiers:
- gemini-3.1-pro: Multi-step pedagogical reasoning, curriculum generation
- gemini-3.8-flash (Default): Orchestration, MCP tools, conversational assistants, live streaming
- gemini-3.5-flash-lite: High-volume batch spreadsheet parsing, text processing, initial classification
"""

import os
import logging
from enum import Enum
from typing import Optional, Dict, Any, Generator, Union
from dataclasses import dataclass

# Configure structured logging
logger = logging.getLogger("model_router")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [AI_ROUTER] %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class ModelTier:
    """Canonical model identifiers for Gemini 3 family."""
    REASONING = "gemini-3.1-pro"
    ORCHESTRATION = "gemini-3.8-flash"
    HIGH_VOLUME = "gemini-3.5-flash-lite"
    DEFAULT = "gemini-3.8-flash"


class TaskCategory(str, Enum):
    """Supported task assignments for dynamic routing."""
    ANALYTICAL_REASONING = "analytical_reasoning"
    CONVERSATIONAL_ORCHESTRATION = "conversational_orchestration"
    HIGH_VOLUME_PROCESSING = "high_volume_processing"
    DEFAULT = "default"


# Canonical task-to-model mapping matrix
TASK_MODEL_MAPPING: Dict[TaskCategory, str] = {
    TaskCategory.ANALYTICAL_REASONING: ModelTier.REASONING,
    TaskCategory.CONVERSATIONAL_ORCHESTRATION: ModelTier.ORCHESTRATION,
    TaskCategory.HIGH_VOLUME_PROCESSING: ModelTier.HIGH_VOLUME,
    TaskCategory.DEFAULT: ModelTier.DEFAULT,
}


@dataclass
class RouterConfig:
    """Configuration options for model router behavior."""
    default_model: str = ModelTier.DEFAULT
    fallback_model: str = ModelTier.DEFAULT
    allow_fallback: bool = True
    api_key_env_var: str = "GEMINI_API_KEY"


class ModelRouter:
    """
    Centralized router for dynamic Gemini model selection, resilient
    execution, and quota fallback handling.
    """

    def __init__(self, config: Optional[RouterConfig] = None):
        self.config = config or RouterConfig()
        self._client = None

    def get_client(self):
        """Lazy-initializes and returns the official google-genai Client."""
        if self._client is None:
            try:
                from google import genai
            except ImportError as exc:
                raise ImportError(
                    "The 'google-genai' SDK is required. Run: pip install 'google-genai>=2.25.0'"
                ) from exc

            api_key = os.environ.get(self.config.api_key_env_var)
            if api_key:
                self._client = genai.Client(api_key=api_key)
            else:
                # Falls back to Application Default Credentials or environment
                self._client = genai.Client()
        return self._client

    def resolve_model(
        self,
        task_category: Union[TaskCategory, str],
        model_override: Optional[str] = None
    ) -> str:
        """
        Determines the appropriate model name based on task category or explicit override.
        """
        if model_override:
            logger.info("Using explicit model override: %s", model_override)
            return model_override

        if isinstance(task_category, str):
            try:
                task_category = TaskCategory(task_category)
            except ValueError:
                logger.warning(
                    "Unknown task category '%s'. Falling back to default %s",
                    task_category,
                    self.config.default_model
                )
                return self.config.default_model

        resolved = TASK_MODEL_MAPPING.get(task_category, self.config.default_model)
        logger.debug("Task '%s' routed to model '%s'", task_category.value, resolved)
        return resolved

    def execute_interaction(
        self,
        task_category: Union[TaskCategory, str],
        user_input: Any,
        model_override: Optional[str] = None,
        stream: bool = False,
        **kwargs
    ) -> Any:
        """
        Executes an interaction with automatic quota / rate-limit fallback.
        
        Args:
            task_category: The task category governing model selection.
            user_input: Prompt string or structured interaction payload.
            model_override: Optional model string override.
            stream: Whether to stream server-sent interaction events.
            **kwargs: Extra parameters passed to client.interactions.create
                     (e.g., tools, system_instruction, previous_interaction_id).
                     
        Returns:
            Interaction response object, or an event generator if stream=True.
        """
        client = self.get_client()
        target_model = self.resolve_model(task_category, model_override)

        try:
            logger.info("Executing interaction with %s (stream=%s)", target_model, stream)
            return client.interactions.create(
                model=target_model,
                input=user_input,
                stream=stream,
                **kwargs
            )
        except Exception as exc:
            # Check if fallback is permitted and we didn't already use the fallback model
            is_quota_or_transient = any(
                code in str(exc).lower()
                for code in ["429", "resource_exhausted", "quota", "rate limit", "503", "unavailable", "timeout"]
            )

            if self.config.allow_fallback and target_model != self.config.fallback_model and is_quota_or_transient:
                logger.warning(
                    "Model %s failed with transient error (%s). Falling back to %s",
                    target_model,
                    exc,
                    self.config.fallback_model
                )
                return client.interactions.create(
                    model=self.config.fallback_model,
                    input=user_input,
                    stream=stream,
                    **kwargs
                )
            # Otherwise re-raise
            logger.error("Interaction failed on model %s: %s", target_model, exc)
            raise


# Global singleton instance & factory
_ROUTER_INSTANCE: Optional[ModelRouter] = None


def get_model_router(config: Optional[RouterConfig] = None) -> ModelRouter:
    """Factory function returning the singleton ModelRouter instance."""
    global _ROUTER_INSTANCE
    if _ROUTER_INSTANCE is None:
        _ROUTER_INSTANCE = ModelRouter(config)
    return _ROUTER_INSTANCE
