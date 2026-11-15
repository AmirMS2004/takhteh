"""OpenRouter access through the OpenAI-compatible API."""

import os
from collections.abc import Iterator

from openai import OpenAI, OpenAIError, RateLimitError

BASE_URL = "https://openrouter.ai/api/v1"
# Free model with strict structured output; chosen by running the live chat tests.
DEFAULT_MODEL = "particle-ai/particle-1:free"


def model() -> str:
    """OPENROUTER_MODEL in .env overrides the default (e.g. a free ":free" model)."""
    return os.environ.get("OPENROUTER_MODEL") or DEFAULT_MODEL


class AIUnavailable(Exception):
    pass


class AIRateLimited(AIUnavailable):
    """OpenRouter refused because of a rate limit (free models have a daily request quota)."""


def client() -> OpenAI:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise AIUnavailable("OPENROUTER_API_KEY is not set")
    # The SDK default (600 s read timeout, 2 retries) could leave the chat waiting for 30 minutes.
    return OpenAI(api_key=key, base_url=BASE_URL, timeout=60, max_retries=1)


def _options(response_format: dict | None) -> dict:
    if not response_format:
        return {}
    # Route only to OpenRouter providers that honour response_format.
    return {"response_format": response_format, "extra_body": {"provider": {"require_parameters": True}}}


def _unavailable(e: OpenAIError) -> AIUnavailable:
    return AIRateLimited(str(e)) if isinstance(e, RateLimitError) else AIUnavailable(str(e))


def chat(messages: list[dict], response_format: dict | None = None) -> str:
    """Sends the messages to the model and returns the reply text."""
    try:
        response = client().chat.completions.create(model=model(), messages=messages, **_options(response_format))
    except OpenAIError as e:
        raise _unavailable(e) from e
    return response.choices[0].message.content or ""


def stream_chat(messages: list[dict], response_format: dict | None = None) -> Iterator[str]:
    """Like `chat`, but yields the reply text in pieces as the model writes it."""
    try:
        stream = client().chat.completions.create(
            model=model(), messages=messages, stream=True, **_options(response_format)
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except OpenAIError as e:
        raise _unavailable(e) from e
