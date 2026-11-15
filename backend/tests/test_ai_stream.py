import json
import os
from types import SimpleNamespace

import httpx2
import openai
import pytest

from app import ai
from app.ai_routes import partial_reply
from tests.conftest import board_path

REPLY = 'کارت «تست» ساخته شد.\nموفق "باشید"'


def model_json(operations=None) -> str:
    return json.dumps({"reply": REPLY, "operations": operations or []}, ensure_ascii=False)


def pieces(text: str, size: int = 7) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]


@pytest.fixture
def stream(monkeypatch):
    """Scripted ai.stream_chat: yields `script["pieces"]`, then raises `script["error"]` if set."""
    script = {"pieces": pieces(model_json()), "error": None, "calls": []}

    def fake(messages, response_format=None):
        script["calls"].append({"messages": messages, "response_format": response_format})
        yield from script["pieces"]
        if script["error"]:
            raise script["error"]

    monkeypatch.setattr(ai, "stream_chat", fake)
    return script


def send(client, message="سلام"):
    board_id = client.get("/api/boards").json()[0]["id"]
    return client.post("/api/ai/chat/stream", json={"board_id": board_id, "message": message, "history": []})


def events(response) -> list[dict]:
    return [json.loads(line) for line in response.text.splitlines()]


# --- partial_reply ---


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("", ""),
        ('{"rep', ""),
        ('{"reply": "', ""),
        ('{"reply": "سلا', "سلا"),
        ('{"reply":"a\\nb', "a\nb"),
        ('{"reply": "a\\', "a"),  # escape not complete yet
        ('{"reply": "a\\u06', "a"),
        ('{"reply": "a\\u06a9b', "akb".replace("k", "ک")),
        ('{"reply": "say \\"hi\\"", "operations"', 'say "hi"'),
        ('{"operations": [], "reply": "late', "late"),  # field order does not matter
    ],
)
def test_partial_reply(raw, expected):
    assert partial_reply(raw) == expected


def test_partial_reply_of_full_json_equals_reply():
    assert partial_reply(model_json()) == REPLY


# --- the stream route ---


def test_streams_the_reply_then_the_result(auth_client, stream):
    response = send(auth_client)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    evs = events(response)
    deltas = [e for e in evs if e["type"] == "delta"]
    assert len(deltas) > 1
    assert "".join(d["text"] for d in deltas) == REPLY
    done = evs[-1]
    assert done["type"] == "done" and done["reply"] == REPLY and done["applied"] == 0
    assert done["board"]["id"] == board_path(auth_client).rsplit("/", 1)[1]


def test_stream_applies_operations(auth_client, stream):
    todo = auth_client.get(board_path(auth_client)).json()["columns"][1]["id"]
    op = {"type": "create_card", "column_id": todo, "title": "از جریان", "details": ""}
    op |= {k: None for k in ["card_id", "index", "due_date", "priority", "assignee", "labels"]}
    stream["pieces"] = pieces(model_json([op]))
    done = events(send(auth_client))[-1]
    assert done["applied"] == 1
    titles = [c["title"] for c in done["board"]["cards"].values()]
    assert "از جریان" in titles


def test_stream_reports_malformed_output_and_keeps_the_board(auth_client, stream):
    before = auth_client.get(board_path(auth_client)).json()
    stream["pieces"] = pieces('{"reply": "نیمه‌کاره", "operations": [{"type": "delete_everything"}]}')
    evs = events(send(auth_client))
    assert evs[-1] == {"type": "error", "status": 502, "detail": "AI returned an invalid response"}
    assert auth_client.get(board_path(auth_client)).json() == before


@pytest.mark.parametrize(
    "error,status", [(ai.AIUnavailable("down"), 503), (ai.AIRateLimited("free-models-per-day"), 429)]
)
def test_stream_reports_ai_errors(auth_client, stream, error, status):
    stream["pieces"], stream["error"] = pieces('{"reply": "شروع'), error
    evs = events(send(auth_client))
    assert "".join(e["text"] for e in evs if e["type"] == "delta") == "شروع"  # what came before the failure
    assert evs[-1]["type"] == "error" and evs[-1]["status"] == status


def test_stream_checks_access_before_starting(client, stream):
    response = client.post("/api/ai/chat/stream", json={"board_id": "board-1", "message": "x"})
    assert response.status_code == 401
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    response = client.post("/api/ai/chat/stream", json={"board_id": "board-999", "message": "x"})
    assert response.status_code == 404
    assert stream["calls"] == []


# --- ai.stream_chat and rate limits ---


def rate_limit_error() -> openai.RateLimitError:
    response = httpx2.Response(429, request=httpx2.Request("POST", "https://openrouter.ai/api/v1/chat/completions"))
    return openai.RateLimitError("free-models-per-day", response=response, body=None)


def test_stream_chat_yields_content_and_maps_errors(monkeypatch):
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        delta = lambda text: SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=text))])  # noqa: E731
        return iter([delta("ab"), SimpleNamespace(choices=[]), delta(None), delta("c")])

    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(ai, "client", lambda: fake_client)
    assert list(ai.stream_chat([{"role": "user", "content": "hi"}], response_format={"type": "json_object"})) == ["ab", "c"]
    assert calls[0]["stream"] is True and calls[0]["response_format"] == {"type": "json_object"}

    def failing(**kwargs):
        raise rate_limit_error()

    fake_client.chat.completions.create = failing
    with pytest.raises(ai.AIRateLimited):
        list(ai.stream_chat([{"role": "user", "content": "hi"}]))


def test_rate_limit_is_429_on_the_regular_route(auth_client, monkeypatch):
    def failing(*args, **kwargs):
        raise ai.AIRateLimited("free-models-per-day")

    monkeypatch.setattr(ai, "chat", failing)
    board_id = auth_client.get("/api/boards").json()[0]["id"]
    response = auth_client.post("/api/ai/chat", json={"board_id": board_id, "message": "x"})
    assert response.status_code == 429


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
def test_live_stream(auth_client):
    evs = events(send(auth_client, "در دو جمله بگو کانبان چیست."))
    assert evs[-1]["type"] == "done", evs[-1]
    assert "".join(e["text"] for e in evs if e["type"] == "delta") == evs[-1]["reply"]
