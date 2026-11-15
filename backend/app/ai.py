"""OpenRouter access through the OpenAI-compatible API."""

import os

from openai import OpenAI, OpenAIError

BASE_URL = "https://openrouter.ai/api/v1"
MODEL = "openai/gpt-oss-120b"


class AIUnavailable(Exception):
    pass


def client() -> OpenAI:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise AIUnavailable("OPENROUTER_API_KEY is not set")
    return OpenAI(api_key=key, base_url=BASE_URL)


def chat(messages: list[dict], response_format: dict | None = None) -> str:
    """Sends the messages to the model and returns the reply text."""
    extra = {"response_format": response_format} if response_format else {}
    try:
        response = client().chat.completions.create(model=MODEL, messages=messages, **extra)
    except OpenAIError as e:
        raise AIUnavailable(str(e)) from e
    return response.choices[0].message.content or ""
