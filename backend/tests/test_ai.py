import os
from types import SimpleNamespace

import openai
import pytest

from app import ai


class FakeCompletions:
    def __init__(self, reply="4", error=None):
        self.reply, self.error, self.calls = reply, error, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        message = SimpleNamespace(content=self.reply)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


@pytest.fixture
def fake(monkeypatch):
    completions = FakeCompletions()
    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    monkeypatch.setattr(ai, "client", lambda: fake_client)
    return completions


def test_client_targets_openrouter(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    client = ai.client()
    assert str(client.base_url).rstrip("/") == ai.BASE_URL
    assert client.api_key == "test-key"


def test_client_has_short_timeout(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    client = ai.client()
    assert client.timeout == 60
    assert client.max_retries == 1


def test_client_requires_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ai.AIUnavailable, match="OPENROUTER_API_KEY"):
        ai.client()


def test_chat_sends_model_and_messages(fake, monkeypatch):
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)
    messages = [{"role": "user", "content": "hi"}]
    assert ai.chat(messages) == "4"
    assert fake.calls == [{"model": ai.DEFAULT_MODEL, "messages": messages}]


def test_model_can_be_overridden(fake, monkeypatch):
    monkeypatch.setenv("OPENROUTER_MODEL", "some/model:free")
    ai.chat([{"role": "user", "content": "hi"}])
    assert fake.calls[0]["model"] == "some/model:free"


def test_chat_passes_response_format(fake):
    fmt = {"type": "json_object"}
    ai.chat([{"role": "user", "content": "hi"}], response_format=fmt)
    assert fake.calls[0]["response_format"] == fmt
    assert fake.calls[0]["extra_body"] == {"provider": {"require_parameters": True}}


def test_chat_wraps_api_errors(fake):
    fake.error = openai.APIConnectionError(request=None)
    with pytest.raises(ai.AIUnavailable):
        ai.chat([{"role": "user", "content": "hi"}])


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
def test_live_two_plus_two():
    assert "4" in ai.chat([{"role": "user", "content": "What is 2+2? Reply with only the number."}])
