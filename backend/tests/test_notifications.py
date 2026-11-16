import datetime

import pytest

from app import ai, db, notifications
from tests.ai_helpers import FakeModel, apply, op, propose
from tests.conftest import board_path


def login(client, username, password="secret123"):
    assert client.post("/api/auth/login", json={"username": username, "password": password}).status_code == 200


@pytest.fixture
def team(client):
    """user owns the board; bob is a member. Signed in as user."""
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    login(client, "user", "password")
    b = client.get(board_path(client)).json()
    client.post(f"/api/boards/{b['id']}/members", json={"username": "bob"})
    return b


def notes(client) -> dict:
    response = client.get("/api/notifications")
    assert response.status_code == 200
    return response.json()


def kinds(client) -> list[tuple[str, dict]]:
    return [(n["kind"], n["params"]) for n in notes(client)["items"]]


def test_assigning_a_card_tells_the_assignee(client, team):
    card = team["columns"][0]["cardIds"][0]
    client.patch(f"/api/cards/{card}", json={"assignee": "bob"})
    login(client, "bob")
    result = notes(client)
    assert result["unread"] == 2  # added to the board, then the card
    first = result["items"][0]
    assert (first["kind"], first["params"]) == ("assigned", {"card": "پژوهش رقبا", "board": "تخته پروژه"})
    assert first["actor"] == "user" and first["board"] == team["id"] and first["read"] is False


def test_a_new_card_with_an_assignee_tells_them(client, team):
    client.post("/api/cards", json={"column_id": team["columns"][1]["id"], "title": "تازه", "assignee": "bob"})
    login(client, "bob")
    assert kinds(client)[0] == ("assigned", {"card": "تازه", "board": "تخته پروژه"})


def test_nobody_is_told_about_their_own_actions(auth_client):
    b = auth_client.get(board_path(auth_client)).json()
    card = b["columns"][0]["cardIds"][0]
    auth_client.patch(f"/api/cards/{card}", json={"assignee": "user", "title": "نو"})
    auth_client.post(f"/api/cards/{card}/move", json={"column_id": b["columns"][1]["id"], "index": 0})
    assert notes(auth_client) == {"unread": 0, "items": []}


def test_the_assignee_hears_about_changes_moves_and_deletion(client, team):
    card = team["columns"][0]["cardIds"][0]
    client.patch(f"/api/cards/{card}", json={"assignee": "bob"})
    client.patch(f"/api/cards/{card}", json={"priority": "high"})
    client.post(f"/api/cards/{card}/move", json={"column_id": team["columns"][4]["id"], "index": 0})
    client.delete(f"/api/cards/{card}")
    login(client, "bob")
    about = {"card": "پژوهش رقبا", "board": "تخته پروژه"}
    assert kinds(client)[:4] == [
        ("card_deleted", about),
        ("card_moved", about | {"from": "ایده‌ها", "to": "انجام‌شده"}),
        ("card_updated", about | {"fields": ["priority"]}),
        ("assigned", about),
    ]


def test_board_membership(client, team):
    client.delete(f"/api/boards/{team['id']}/members/bob")
    login(client, "bob")
    assert kinds(client) == [
        ("removed_from_board", {"board": "تخته پروژه"}),
        ("added_to_board", {"board": "تخته پروژه"}),
    ]


def test_deleting_a_board_tells_its_members(client, team):
    client.delete(f"/api/boards/{team['id']}")
    login(client, "bob")
    assert kinds(client)[0] == ("board_deleted", {"board": "تخته پروژه"})


def test_the_assistants_changes_notify_too(client, team, monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(ai, "chat", model)
    card = team["columns"][0]["cardIds"][0]
    apply(client, propose(client, model, [op("update_card", card_id=card, assignee="bob")]))
    login(client, "bob")
    first = notes(client)["items"][0]
    assert first["kind"] == "assigned" and first["via"] == "assistant" and first["actor"] == "user"


def test_due_dates(client, team, monkeypatch):
    today = datetime.date(2026, 11, 16)
    monkeypatch.setattr(notifications.datetime, "date", type("D", (datetime.date,), {"today": staticmethod(lambda: today)}))
    cards = team["columns"][0]["cardIds"]
    done = team["columns"][4]["cardIds"][0]
    for card, due in [(cards[0], "2026-11-17"), (cards[1], "2026-11-10"), (cards[2], "2026-12-30"), (done, "2026-11-01")]:
        client.patch(f"/api/cards/{card}", json={"assignee": "bob", "due_date": due})
    login(client, "bob")
    due = [(k, p) for k, p in kinds(client) if k in ("due_soon", "overdue")]
    assert sorted(due, key=lambda x: x[0]) == [
        ("due_soon", {"card": "پژوهش رقبا", "board": "تخته پروژه", "date": "2026-11-17"}),
        ("overdue", {"card": "حالت تاریک", "board": "تخته پروژه", "date": "2026-11-10"}),
    ]
    # Once per card and date, however often they look.
    assert len([k for k, _ in kinds(client) if k in ("due_soon", "overdue")]) == 2
    # The next day the due-soon card is overdue: one more notification.
    today = datetime.date(2026, 11, 18)
    assert ("overdue", {"card": "پژوهش رقبا", "board": "تخته پروژه", "date": "2026-11-17"}) in kinds(client)


def test_marking_everything_read(client, team):
    login(client, "bob")
    assert notes(client)["unread"] == 1
    assert client.post("/api/notifications/read").status_code == 200
    result = notes(client)
    assert result["unread"] == 0 and all(n["read"] for n in result["items"])


def test_notifications_are_private(client, team):
    assert notes(client)["items"] == []  # user sees none of bob's
    client.post("/api/auth/logout")
    assert client.get("/api/notifications").status_code == 401


def test_new_notifications_are_pushed_live(client, team):
    card = team["columns"][0]["cardIds"][0]
    login(client, "bob")
    with client.websocket_connect("/api/notifications/live") as ws:
        login(client, "user", "password")
        client.patch(f"/api/cards/{card}", json={"assignee": "bob"})
        assert ws.receive_json() == {"type": "notifications"}


def test_the_assistants_dry_run_notifies_nobody(client, team, monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(ai, "chat", model)
    propose(client, model, [op("update_card", card_id=team["columns"][0]["cardIds"][0], assignee="bob")])
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM notifications WHERE kind = 'assigned'").fetchone()[0] == 0
