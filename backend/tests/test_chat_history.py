import json

import pytest

from app import ai, db
from app.ai_routes import MAX_HISTORY


class Model:
    def __init__(self):
        self.calls, self.reply = [], {"reply": "باشه", "operations": []}

    def __call__(self, messages, response_format=None):
        self.calls.append(messages)
        return self.reply if isinstance(self.reply, str) else json.dumps(self.reply, ensure_ascii=False)


@pytest.fixture
def model(monkeypatch):
    fake = Model()
    monkeypatch.setattr(ai, "chat", fake)
    return fake


def board_id(client) -> str:
    return client.get("/api/boards").json()[0]["id"]


def send(client, message, board=None):
    return client.post("/api/ai/chat", json={"board_id": board or board_id(client), "message": message})


def history(client, board=None):
    response = client.get(f"/api/ai/history/{board or board_id(client)}")
    assert response.status_code == 200
    return [{"role": m["role"], "content": m["content"]} for m in response.json()]


def test_completed_turns_are_stored_and_listed(auth_client, model):
    assert history(auth_client) == []
    send(auth_client, "سلام")
    send(auth_client, "خداحافظ")
    assert history(auth_client) == [
        {"role": "user", "content": "سلام"},
        {"role": "assistant", "content": "باشه"},
        {"role": "user", "content": "خداحافظ"},
        {"role": "assistant", "content": "باشه"},
    ]


def test_failed_turns_are_not_stored(auth_client, model):
    model.reply = "not json"
    assert send(auth_client, "خراب").status_code == 502
    assert history(auth_client) == []


def test_turns_whose_changes_were_rejected_are_still_stored(auth_client, model):
    model.reply = {"reply": "انجام شد", "operations": [{"type": "update_card", "card_id": "card-999", "title": "x"}
                   | dict.fromkeys(["column_id", "details", "index", "due_date", "priority", "assignee", "labels"])]}
    assert send(auth_client, "تغییر بده").json()["error"]
    assert [m["content"] for m in history(auth_client)] == ["تغییر بده", "انجام شد"]


def test_the_model_sees_only_the_latest_stored_messages(auth_client, model):
    for i in range(MAX_HISTORY):  # 2 * MAX_HISTORY stored messages
        send(auth_client, f"پیام {i}")
    send(auth_client, "آخر")
    sent = model.calls[-1]
    assert sent[0]["role"] == "system" and sent[-1] == {"role": "user", "content": "آخر"}
    past = sent[1:-1]
    assert len(past) == MAX_HISTORY
    assert past[0] == {"role": "user", "content": f"پیام {MAX_HISTORY // 2}"}


def test_clearing_the_conversation(auth_client, model):
    send(auth_client, "سلام")
    assert auth_client.delete(f"/api/ai/history/{board_id(auth_client)}").status_code == 200
    assert history(auth_client) == []
    send(auth_client, "دوباره")
    assert model.calls[-1][1:] == [{"role": "user", "content": "دوباره"}]


def test_conversations_are_per_user_and_per_board(client, model):
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    shared = board_id(client)
    second = client.post("/api/boards", json={"title": "دوم"}).json()["id"]
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    client.post(f"/api/boards/{shared}/members", json={"username": "bob"})

    send(client, "پیام user", shared)
    assert history(client, second) == []

    client.post("/api/auth/login", json={"username": "bob", "password": "secret123"})
    assert history(client, shared) == []  # bob does not see user's conversation
    send(client, "پیام bob", shared)
    assert model.calls[-1][1:] == [{"role": "user", "content": "پیام bob"}]


def test_leaving_a_board_deletes_that_conversation(client, model):
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    shared = board_id(client)
    client.post(f"/api/boards/{shared}/members", json={"username": "bob"})
    client.post("/api/auth/login", json={"username": "bob", "password": "secret123"})
    send(client, "سلام", shared)
    client.delete(f"/api/boards/{shared}/members/bob")
    with db.connect() as conn:
        bob = conn.execute("SELECT id FROM users WHERE username = 'bob'").fetchone()[0]
        assert conn.execute("SELECT COUNT(*) FROM chat_messages WHERE user_id = ?", (bob,)).fetchone()[0] == 0


def test_history_access(client):
    assert client.get("/api/ai/history/board-1").status_code == 401
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    assert client.get("/api/ai/history/board-1").status_code == 404  # bob is not on user's board
    assert client.delete("/api/ai/history/board-1").status_code == 404


def test_streamed_turns_are_stored_too(auth_client, monkeypatch):
    monkeypatch.setattr(ai, "stream_chat", lambda messages, response_format=None: iter(['{"reply": "سلام", "operations": []}']))
    response = auth_client.post("/api/ai/chat/stream", json={"board_id": board_id(auth_client), "message": "هی"})
    assert response.status_code == 200
    assert history(auth_client) == [{"role": "user", "content": "هی"}, {"role": "assistant", "content": "سلام"}]
