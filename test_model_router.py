import unittest
from unittest.mock import MagicMock

from ai_model_router import GeminiClient, GEMINI_MODEL


class TestGeminiClient(unittest.TestCase):

    def test_single_low_cost_model(self):
        """Every AI call uses the one low-cost model."""
        self.assertEqual(GEMINI_MODEL, "gemini-3.5-flash-lite")
        self.assertEqual(GeminiClient().model, GEMINI_MODEL)

    def test_generate_text_uses_generate_content(self):
        client = GeminiClient()
        mock_sdk = MagicMock()
        mock_sdk.models.generate_content.return_value = MagicMock(text="ok")
        client._client = mock_sdk

        self.assertEqual(client.generate_text("hello"), "ok")
        kwargs = mock_sdk.models.generate_content.call_args.kwargs
        self.assertEqual(kwargs["model"], GEMINI_MODEL)
        self.assertEqual(kwargs["contents"], "hello")

    def test_generate_json_parses_response(self):
        client = GeminiClient()
        mock_sdk = MagicMock()
        mock_sdk.models.generate_content.return_value = MagicMock(text='{"a": 1}')
        client._client = mock_sdk

        self.assertEqual(client.generate_json("give json"), {"a": 1})


if __name__ == "__main__":
    unittest.main()
