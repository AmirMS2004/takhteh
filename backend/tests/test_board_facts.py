import datetime
import json

import pytest

from app import ai, db
from app.ai_routes import board_facts
from tests.conftest import AI_KEY_SET, board_path

TODAY = datetime.date(2026, 11, 15)


def board(client) -> dict:
    return client.get(board_path(client)).json()


def card_times(card: str) -> tuple:
    with db.connect() as conn:
        row = conn.execute("SELECT created_at, moved_at FROM cards WHERE id = ?", (int(card.split("-")[1]),)).fetchone()
    return tuple(row)


def set_card(card: str, **fields):
    with db.connect() as conn:
        for name, value in fields.items():
            conn.execute(f"UPDATE cards SET {name} = ? WHERE id = ?", (value, int(card.split("-")[1])))


def facts(client) -> dict:
    with db.connect() as conn:
        return board_facts(conn, int(board(client)["id"].split("-")[1]), TODAY)


def test_cards_record_when_they_were_created_and_moved(auth_client):
    b = board(auth_client)
    card = auth_client.post("/api/cards", json={"column_id": b["columns"][0]["id"], "title": "تازه"}).json()["id"]
    created, moved = card_times(card)
    assert created and created == moved
    set_card(card, created_at="2026-01-01 10:00:00", moved_at="2026-01-01 10:00:00")

    auth_client.post(f"/api/cards/{card}/move", json={"column_id": b["columns"][0]["id"], "index": 0})
    assert card_times(card)[1] == "2026-01-01 10:00:00"  # same column: not a move between columns
    auth_client.post(f"/api/cards/{card}/move", json={"column_id": b["columns"][2]["id"], "index": 0})
    created, moved = card_times(card)
    assert created == "2026-01-01 10:00:00" and moved > created


def test_facts(auth_client):
    b = board(auth_client)
    cards = {c["title"]: c["id"] for c in b["cards"].values()}
    old = "2026-10-01 09:00:00"
    with db.connect() as conn:
        conn.execute("UPDATE cards SET created_at = ?, moved_at = ?", (old, old))
    set_card(cards["راه‌اندازی مخزن"], moved_at="2026-11-12 09:00:00")  # in the done column, moved this week
    set_card(cards["پژوهش رقبا"], created_at="2026-11-14 09:00:00", due_date="2026-11-10")
    set_card(cards["طراحی صفحه ورود"], due_date="2026-11-20")
    set_card(cards["تعریف شاخص‌ها"], due_date="2026-12-30")
    set_card(cards["جلسه شروع پروژه"], due_date="2026-11-01")  # done, so not overdue
    auth_client.patch(f"/api/cards/{cards['حالت تاریک']}", json={"assignee": "user"})

    result = facts(auth_client)
    assert result["cards_per_column"] == {"ایده‌ها": 3, "برای انجام": 2, "در حال انجام": 2, "بازبینی": 1, "انجام‌شده": 2}
    assert result["done_column"] == "انجام‌شده"
    assert result["done_this_week"] == ["راه‌اندازی مخزن"]
    assert result["created_this_week"] == ["پژوهش رقبا"]
    assert result["overdue"] == ["پژوهش رقبا"]
    assert result["due_in_next_7_days"] == ["طراحی صفحه ورود"]
    assert result["open_cards_per_assignee"] == {"(unassigned)": 7, "user": 1}


def test_cards_without_times_are_not_this_week(auth_client):
    with db.connect() as conn:
        conn.execute("UPDATE cards SET created_at = NULL, moved_at = NULL")
    result = facts(auth_client)
    assert result["done_this_week"] == [] and result["created_this_week"] == []


def test_older_databases_get_the_time_columns(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    monkeypatch.setenv("DB_PATH", str(path))
    db.init_db()
    with db.connect() as conn:
        conn.execute("ALTER TABLE cards DROP COLUMN created_at")
        conn.execute("ALTER TABLE cards DROP COLUMN moved_at")
    db.init_db()
    with db.connect() as conn:
        names = {row["name"] for row in conn.execute("PRAGMA table_info(cards)")}
    assert {"created_at", "moved_at"} <= names


def test_the_model_gets_the_facts(auth_client, monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "chat", lambda messages, response_format=None: calls.append(messages) or json.dumps(
        {"reply": "گزارش", "operations": []}))
    auth_client.post("/api/ai/chat", json={"board_id": board(auth_client)["id"], "message": "گزارش هفتگی بده"})
    system = calls[0][0]["content"]
    assert "Facts for summaries:" in system
    assert '"done_column": "انجام‌شده"' in system
    assert "break a card into smaller tasks" in system


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_splits_a_card(auth_client):
    response = auth_client.post(
        "/api/ai/chat",
        json={"board_id": board(auth_client)["id"], "message": "کارت «پژوهش رقبا» را به چند کارت کوچک‌تر تقسیم کن."},
    ).json()
    assert response["error"] is None, response
    creates = [op for op in response["operations"] if op["type"] == "create_card"]
    assert 2 <= len(creates) <= 8, response
    assert all(op["column_id"] == board(auth_client)["columns"][0]["id"] for op in creates), response


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_weekly_report(auth_client):
    response = auth_client.post(
        "/api/ai/chat", json={"board_id": board(auth_client)["id"], "message": "گزارش هفتگی این برد را بنویس."}
    ).json()
    assert response["operations"] == [] and response["error"] is None, response
    assert "**" not in response["reply"] and len(response["reply"]) > 80, response
