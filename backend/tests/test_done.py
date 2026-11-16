import datetime

from app import ai, db, notifications
from tests.ai_helpers import FakeModel, apply, op, propose
from tests.conftest import board_path
from tests.test_board_facts import facts, set_card
from tests.test_notifications import kinds, login, team  # noqa: F401 (fixture)


def board(client) -> dict:
    return client.get(board_path(client)).json()


def done_at(card: str):
    with db.connect() as conn:
        return conn.execute("SELECT done_at FROM cards WHERE id = ?", (int(card.split("-")[1]),)).fetchone()[0]


def history(client) -> list[dict]:
    return client.get(f"/api/boards/{board(client)['id']}/activity").json()


def test_ticking_a_card_done_and_back(auth_client):
    card = board(auth_client)["columns"][0]["cardIds"][0]
    assert board(auth_client)["cards"][card]["done"] is False

    response = auth_client.patch(f"/api/cards/{card}", json={"done": True})
    assert response.status_code == 200 and response.json()["done"] is True
    first = done_at(card)
    assert first
    # Ticking it again keeps the time it was first done.
    auth_client.patch(f"/api/cards/{card}", json={"done": True})
    assert done_at(card) == first

    auth_client.patch(f"/api/cards/{card}", json={"done": False})
    assert board(auth_client)["cards"][card]["done"] is False and done_at(card) is None
    assert [(e["action"], e["params"]) for e in history(auth_client)] == [
        ("reopen_card", {"card": "پژوهش رقبا"}),
        ("complete_card", {"card": "پژوهش رقبا"}),
    ]


def test_done_cannot_be_null(auth_client):
    card = board(auth_client)["columns"][0]["cardIds"][0]
    assert auth_client.patch(f"/api/cards/{card}", json={"done": None}).status_code == 422


def test_the_assignee_hears_when_their_card_is_done(client, team):
    card = team["columns"][0]["cardIds"][0]
    client.patch(f"/api/cards/{card}", json={"assignee": "bob"})
    client.patch(f"/api/cards/{card}", json={"done": True})
    login(client, "bob")
    assert kinds(client)[0] == ("complete_card", {"card": "پژوهش رقبا", "board": "تخته پروژه"})


def test_done_cards_are_not_due(client, team, monkeypatch):
    today = datetime.date(2026, 11, 16)
    monkeypatch.setattr(notifications.datetime, "date", type("D", (datetime.date,), {"today": staticmethod(lambda: today)}))
    soon, late = team["columns"][0]["cardIds"][:2]
    client.patch(f"/api/cards/{soon}", json={"assignee": "bob", "due_date": "2026-11-17", "done": True})
    client.patch(f"/api/cards/{late}", json={"assignee": "bob", "due_date": "2026-11-10"})
    client.patch(f"/api/cards/{late}", json={"done": True})
    login(client, "bob")
    assert [k for k, _ in kinds(client) if k in ("due_soon", "overdue")] == []


def test_done_cards_count_as_done_in_the_facts(auth_client):
    cards = {c["title"]: c["id"] for c in board(auth_client)["cards"].values()}
    old = "2026-10-01 09:00:00"
    with db.connect() as conn:
        conn.execute("UPDATE cards SET created_at = ?, moved_at = ?", (old, old))
    set_card(cards["پژوهش رقبا"], due_date="2026-11-10", done_at="2026-11-14 09:00:00")
    set_card(cards["حالت تاریک"], due_date="2026-11-17", done_at="2026-10-02 09:00:00")
    result = facts(auth_client)
    assert result["done_this_week"] == ["پژوهش رقبا"]
    assert result["overdue"] == [] and result["due_in_next_7_days"] == []
    assert result["open_cards_per_assignee"] == {"(unassigned)": 6}


def test_the_assistant_can_tick_a_card(auth_client, monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(ai, "chat", model)
    card = board(auth_client)["columns"][0]["cardIds"][0]
    key = propose(auth_client, model, [op("update_card", card_id=card, done=True)])
    assert apply(auth_client, key).status_code == 200
    assert board(auth_client)["cards"][card]["done"] is True


def test_older_databases_get_done_at(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "old.db"))
    db.init_db()
    with db.connect() as conn:
        conn.execute("ALTER TABLE cards DROP COLUMN done_at")
    db.init_db()
    with db.connect() as conn:
        assert "done_at" in {row["name"] for row in conn.execute("PRAGMA table_info(cards)")}
