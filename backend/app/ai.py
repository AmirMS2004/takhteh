"""AI access through an OpenAI-compatible API: Groq or OpenRouter, chosen in .env."""

import os
from collections.abc import Iterator

from openai import OpenAI, OpenAIError, RateLimitError

PROVIDERS = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "key": "GROQ_API_KEY",
        "model": "openai/gpt-oss-120b",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "key": "OPENROUTER_API_KEY",
        # Free model with strict structured output; chosen by running the live chat tests.
        "model": "particle-ai/particle-1:free",
    },
}


def provider() -> str:
    """AI_PROVIDER in .env, or Groq when a Groq key is set, otherwise OpenRouter."""
    name = os.environ.get("AI_PROVIDER") or ("groq" if os.environ.get("GROQ_API_KEY") else "openrouter")
    if name not in PROVIDERS:
        raise AIUnavailable(f"unknown AI_PROVIDER {name!r}")
    return name


def model() -> str:
    """AI_MODEL in .env overrides the provider's default model."""
    return os.environ.get("AI_MODEL") or PROVIDERS[provider()]["model"]


class AIUnavailable(Exception):
    pass


class AIRateLimited(AIUnavailable):
    """The provider refused because of a rate limit (free tiers have request quotas)."""


def client() -> OpenAI:
    config = PROVIDERS[provider()]
    key = os.environ.get(config["key"])
    if not key:
        raise AIUnavailable(f"{config['key']} is not set")
    # The SDK default (600 s read timeout, 2 retries) could leave the chat waiting for 30 minutes.
    return OpenAI(api_key=key, base_url=config["base_url"], timeout=60, max_retries=1)


def _options(response_format: dict | None) -> dict:
    if not response_format:
        return {}
    options: dict = {"response_format": response_format}
    if provider() == "openrouter":
        # OpenRouter routes to several providers; only use those that honour response_format.
        options["extra_body"] = {"provider": {"require_parameters": True}}
    return options


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
