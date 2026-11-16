"""The interface language: kept in the profile, given to the model, and structured history and proposals
that the client words in either language."""

import pytest

from app import ai, db
from tests.ai_helpers import FakeModel, op, propose
from tests.conftest import board_path


@pytest.fixture
def model(monkeypatch):
    fake = FakeModel()
    monkeypatch.setattr(ai, "chat", fake)
    return fake


def board(client) -> dict:
    return client.get(board_path(client)).json()


def test_the_language_is_part_of_the_profile(auth_client):
    assert auth_client.get("/api/auth/me").json()["language"] == "fa"
    assert auth_client.patch("/api/auth/profile", json={"language": "en"}).json()["language"] == "en"
    assert auth_client.get("/api/auth/me").json()["language"] == "en"
    assert auth_client.patch("/api/auth/profile", json={"language": "de"}).status_code == 422


@pytest.mark.parametrize("language,name", [("fa", "Persian"), ("en", "English")])
def test_the_model_is_told_the_users_language(auth_client, model, language, name):
    auth_client.patch("/api/auth/profile", json={"language": language})
    auth_client.post("/api/ai/chat", json={"board_id": board(auth_client)["id"], "message": "hi"})
    assert f"The user's interface language is {name}" in model.calls[0]["messages"][0]["content"]


def test_history_entries_carry_their_names(auth_client):
    b = board(auth_client)
    todo, done = b["columns"][1]["id"], b["columns"][4]["id"]
    red = next(label for label in b["labels"] if label["color"] == "red")
    card = auth_client.post("/api/cards", json={"column_id": todo, "title": "تازه"}).json()["id"]
    auth_client.patch(f"/api/cards/{card}", json={"title": "نو", "priority": "high"})
    auth_client.post(f"/api/cards/{card}/move", json={"column_id": done, "index": 0})
    auth_client.delete(f"/api/labels/{red['id']}")
    entries = auth_client.get(f"/api/boards/{b['id']}/activity").json()
    assert [(e["action"], e["params"]) for e in entries] == [
        ("delete_label", {"label": {"name": "", "color": "red"}}),
        ("move_card", {"card": "نو", "from": "برای انجام", "to": "انجام‌شده"}),
        ("update_card", {"card": "تازه", "fields": ["title", "priority"], "title": "نو"}),
        ("create_card", {"card": "تازه", "column": "برای انجام"}),
    ]


def test_older_entries_have_no_params(auth_client):
    b = board(auth_client)
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO activity (board_id, user_id, action, summary) VALUES (?, 1, 'create_card', 'متن قدیمی')",
            (int(b["id"].split("-")[1]),),
        )
    entry = auth_client.get(f"/api/boards/{b['id']}/activity").json()[0]
    assert entry["params"] is None and entry["summary"] == "متن قدیمی"


def test_proposals_carry_structured_items(auth_client, model):
    b = board(auth_client)
    first = b["columns"][0]
    red = next(label for label in b["labels"] if label["color"] == "red")
    with db.connect() as conn:
        db.create_user(conn, "bob", "secret123")
    propose(auth_client, model, [
        op("create_column", title="آزمون"),
        op("create_label", name="فوری", color="orange"),
        op("create_card", column_id="new:آزمون", title="کارت", details="", priority="high", due_date="2026-12-01",
           labels=[red["id"], "new:فوری"]),
        op("move_card", card_id=first["cardIds"][0], column_id=b["columns"][1]["id"], index=0),
        op("delete_column", column_id=b["columns"][3]["id"]),
        op("update_label", label_id=red["id"], name="مهم"),
        op("add_member", username="bob"),
    ])
    items = auth_client.get(f"/api/ai/history/{b['id']}").json()[-1]["proposal"]["items"]
    assert items == [
        {"type": "create_column", "params": {"title": "آزمون"}},
        {"type": "create_label", "params": {"label": {"name": "فوری", "color": "orange"}}},
        {"type": "create_card", "params": {
            "title": "کارت", "column": "آزمون", "due_date": "2026-12-01", "priority": "high",
            "labels": [{"name": "", "color": "red"}, {"name": "فوری", "color": None}],
        }},
        {"type": "move_card", "params": {"card": "پژوهش رقبا", "column": "برای انجام", "top": True}},
        {"type": "delete_column", "params": {"column": "بازبینی", "count": 1}},
        {"type": "update_label", "params": {"label": {"name": "", "color": "red"}, "name": "مهم"}},
        {"type": "add_member", "params": {"member": "bob"}},
    ]
