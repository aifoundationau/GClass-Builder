import unittest
from unittest.mock import MagicMock, patch
from ai_model_router import (
    get_model_router,
    ModelRouter,
    TaskCategory,
    ModelTier,
    RouterConfig
)


class TestModelRouter(unittest.TestCase):

    def setUp(self):
        self.router = ModelRouter(RouterConfig(allow_fallback=True))

    def test_routing_matrix_assignments(self):
        """Verify each task category resolves to the designated model tier."""
        self.assertEqual(
            self.router.resolve_model(TaskCategory.ANALYTICAL_REASONING),
            "gemini-3.1-pro"
        )
        self.assertEqual(
            self.router.resolve_model(TaskCategory.CONVERSATIONAL_ORCHESTRATION),
            "gemini-3.8-flash"
        )
        self.assertEqual(
            self.router.resolve_model(TaskCategory.HIGH_VOLUME_PROCESSING),
            "gemini-3.5-flash-lite"
        )
        self.assertEqual(
            self.router.resolve_model(TaskCategory.DEFAULT),
            "gemini-3.8-flash"
        )

    def test_model_override(self):
        """Verify explicit override takes precedence over category mapping."""
        chosen = self.router.resolve_model(
            TaskCategory.HIGH_VOLUME_PROCESSING,
            model_override="custom-experimental-model"
        )
        self.assertEqual(chosen, "custom-experimental-model")

    def test_fallback_on_rate_limit(self):
        """Verify graceful degradation to default model on 429 quota exhaustion."""
        mock_client = MagicMock()
        # First call fails with 429, second call succeeds
        mock_client.interactions.create.side_effect = [
            Exception("429 Resource exhausted: Quota exceeded"),
            MagicMock(output_text="Fallback success response")
        ]
        self.router._client = mock_client

        result = self.router.execute_interaction(
            task_category=TaskCategory.ANALYTICAL_REASONING,
            user_input="Analyze complex curriculum"
        )

        self.assertEqual(mock_client.interactions.create.call_count, 2)
        # First attempt: target model gemini-3.1-pro
        first_call = mock_client.interactions.create.call_args_list[0]
        self.assertEqual(first_call.kwargs["model"], "gemini-3.1-pro")
        # Second attempt: fallback model gemini-3.8-flash
        second_call = mock_client.interactions.create.call_args_list[1]
        self.assertEqual(second_call.kwargs["model"], "gemini-3.8-flash")
        self.assertEqual(result.output_text, "Fallback success response")


if __name__ == "__main__":
    unittest.main()
