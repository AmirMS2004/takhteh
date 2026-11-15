"""OpenRouter access through the OpenAI-compatible API."""

import os

from openai import OpenAI, OpenAIError

BASE_URL = "https://openrouter.ai/api/v1"
# Free model with strict structured output; chosen by running the live chat tests.
DEFAULT_MODEL = "particle-ai/particle-1:free"


def model() -> str:
    """OPENROUTER_MODEL in .env overrides the default (e.g. a free ":free" model)."""
    return os.environ.get("OPENROUTER_MODEL") or DEFAULT_MODEL


class AIUnavailable(Exception):
    pass


def client() -> OpenAI:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise AIUnavailable("OPENROUTER_API_KEY is not set")
    return OpenAI(api_key=key, base_url=BASE_URL)


def chat(messages: list[dict], response_format: dict | None = None) -> str:
    """Sends the messages to the model and returns the reply text."""
    extra = {}
    if response_format:
        # Route only to OpenRouter providers that honour response_format.
        extra = {"response_format": response_format, "extra_body": {"provider": {"require_parameters": True}}}
    try:
        response = client().chat.completions.create(model=model(), messages=messages, **extra)
    except OpenAIError as e:
        raise AIUnavailable(str(e)) from e
    return response.choices[0].message.content or ""
