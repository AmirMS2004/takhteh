from types import SimpleNamespace

import openai
import pytest

from app import ai
from tests.conftest import AI_KEY_SET


class FakeCompletions:
    def __init__(self, reply="4", error=None):
        self.reply, self.error, self.calls = reply, error, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        message = SimpleNamespace(content=self.reply)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


@pytest.fixture(autouse=True)
def no_ai_env(request, monkeypatch):
    """Each test chooses its own provider settings; live tests keep the real ones."""
    if request.node.get_closest_marker("live"):
        return
    for name in ("AI_PROVIDER", "AI_MODEL", "GROQ_API_KEY", "OPENROUTER_API_KEY"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def fake(monkeypatch):
    completions = FakeCompletions()
    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    monkeypatch.setattr(ai, "client", lambda: fake_client)
    return completions


# --- provider selection ---


def test_openrouter_without_a_groq_key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
    assert ai.provider() == "openrouter"
    client = ai.client()
    assert str(client.base_url).rstrip("/") == "https://openrouter.ai/api/v1"
    assert client.api_key == "or-key"
    assert ai.model() == "particle-ai/particle-1:free"


def test_groq_when_a_groq_key_is_set(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    assert ai.provider() == "groq"
    client = ai.client()
    assert str(client.base_url).rstrip("/") == "https://api.groq.com/openai/v1"
    assert client.api_key == "groq-key"
    assert ai.model() == "openai/gpt-oss-120b"


def test_ai_provider_and_model_can_be_chosen(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.setenv("AI_MODEL", "some/model:free")
    assert ai.provider() == "openrouter"
    assert ai.model() == "some/model:free"


def test_unknown_provider(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "nope")
    with pytest.raises(ai.AIUnavailable, match="AI_PROVIDER"):
        ai.provider()


@pytest.mark.parametrize("provider,key", [("groq", "GROQ_API_KEY"), ("openrouter", "OPENROUTER_API_KEY")])
def test_client_requires_the_provider_key(monkeypatch, provider, key):
    monkeypatch.setenv("AI_PROVIDER", provider)
    with pytest.raises(ai.AIUnavailable, match=key):
        ai.client()


def test_client_has_short_timeout(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    client = ai.client()
    assert client.timeout == 60
    assert client.max_retries == 1


# --- requests ---


def test_chat_sends_model_and_messages(fake, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    messages = [{"role": "user", "content": "hi"}]
    assert ai.chat(messages) == "4"
    assert fake.calls == [{"model": "openai/gpt-oss-120b", "messages": messages}]


def test_openrouter_only_routes_to_providers_honouring_the_format(fake, monkeypatch):
    fmt = {"type": "json_object"}
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
    ai.chat([{"role": "user", "content": "hi"}], response_format=fmt)
    assert fake.calls[-1]["response_format"] == fmt
    assert fake.calls[-1]["extra_body"] == {"provider": {"require_parameters": True}}

    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    ai.chat([{"role": "user", "content": "hi"}], response_format=fmt)
    assert fake.calls[-1]["response_format"] == fmt
    assert "extra_body" not in fake.calls[-1]  # OpenRouter-only option


def test_chat_wraps_api_errors(fake):
    fake.error = openai.APIConnectionError(request=None)
    with pytest.raises(ai.AIUnavailable):
        ai.chat([{"role": "user", "content": "hi"}])


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_two_plus_two():
    assert "4" in ai.chat([{"role": "user", "content": "What is 2+2? Reply with only the number."}])
