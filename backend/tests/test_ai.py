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


def test_client_requires_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ai.AIUnavailable, match="OPENROUTER_API_KEY"):
        ai.client()


def test_chat_sends_model_and_messages(fake):
    messages = [{"role": "user", "content": "hi"}]
    assert ai.chat(messages) == "4"
    assert fake.calls == [{"model": "openai/gpt-oss-120b", "messages": messages}]


def test_chat_passes_response_format(fake):
    fmt = {"type": "json_object"}
    ai.chat([{"role": "user", "content": "hi"}], response_format=fmt)
    assert fake.calls[0]["response_format"] == fmt


def test_chat_wraps_api_errors(fake):
    fake.error = openai.APIConnectionError(request=None)
    with pytest.raises(ai.AIUnavailable):
        ai.chat([{"role": "user", "content": "hi"}])


def test_ping_requires_login(client):
    assert client.post("/api/ai/ping").status_code == 401


def test_ping_returns_answer(auth_client, fake):
    response = auth_client.post("/api/ai/ping")
    assert response.status_code == 200
    assert response.json() == {"answer": "4"}
    assert "2+2" in fake.calls[0]["messages"][0]["content"]


def test_ping_without_key_is_503(auth_client, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    response = auth_client.post("/api/ai/ping")
    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_ping_api_error_is_503(auth_client, fake):
    fake.error = openai.APIConnectionError(request=None)
    assert auth_client.post("/api/ai/ping").status_code == 503


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
def test_live_two_plus_two(auth_client):
    response = auth_client.post("/api/ai/ping")
    assert response.status_code == 200, response.text
    assert "4" in response.json()["answer"]
