"""Shared helpers for the assistant tests: a scripted model and proposals."""

import json

from app import db
from app.ai_routes import OPERATION_FIELDS
from tests.conftest import board_path

NULLS = OPERATION_FIELDS[1:]


def op(type_: str, **fields) -> dict:
    """A flat operation as the model returns it: unused fields are null."""
    return {"type": type_} | dict.fromkeys(NULLS) | fields


class FakeModel:
    def __init__(self):
        self.reply = {"reply": "باشه", "operations": []}
        self.calls = []

    def __call__(self, messages, response_format=None):
        self.calls.append({"messages": messages, "response_format": response_format})
        return self.reply if isinstance(self.reply, str) else json.dumps(self.reply, ensure_ascii=False)


def board(client) -> dict:
    return client.get(board_path(client)).json()


def send(client, message="سلام", board_id=None):
    board_id = board_id or client.get("/api/boards").json()[0]["id"]
    return client.post("/api/ai/chat", json={"board_id": board_id, "message": message})


def apply(client, key):
    return client.post(f"/api/ai/proposals/{key}/apply")


def propose(client, model, operations, message="تغییر بده") -> str:
    """Has the model propose `operations` and returns the message id; the proposal must be valid."""
    model.reply = {"reply": "پیشنهاد", "operations": operations}
    response = send(client, message).json()
    assert response["error"] is None and response["proposal"], response
    return response["message_id"]


def stored_operations(key: str) -> list[dict]:
    with db.connect() as conn:
        row = conn.execute("SELECT proposal FROM chat_messages WHERE id = ?", (int(key.split("-")[1]),)).fetchone()
    return json.loads(row["proposal"])["operations"]
