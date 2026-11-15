import sqlite3

import pytest

from app import db

DETAILS = {"due_date": "2026-12-01", "priority": "high", "label": "green", "assignee": "سارا"}


def first_card(client) -> str:
    return client.get("/api/board").json()["columns"][0]["cardIds"][0]


def card(client, card_id) -> dict:
    return client.get("/api/board").json()["cards"][card_id]


def test_cards_have_empty_details_by_default(auth_client):
    c = card(auth_client, first_card(auth_client))
    assert {k: c[k] for k in DETAILS} == dict.fromkeys(DETAILS)


def test_create_card_with_details(auth_client):
    column = auth_client.get("/api/board").json()["columns"][1]["id"]
    response = auth_client.post("/api/cards", json={"column_id": column, "title": "x"} | DETAILS)
    assert response.status_code == 201
    created = response.json()
    assert {k: created[k] for k in DETAILS} == DETAILS
    assert card(auth_client, created["id"]) == created


def test_update_sets_and_clears_only_sent_fields(auth_client):
    card_id = first_card(auth_client)
    auth_client.patch(f"/api/cards/{card_id}", json=DETAILS)
    assert {k: card(auth_client, card_id)[k] for k in DETAILS} == DETAILS

    # Only priority is sent: it is cleared, everything else stays.
    response = auth_client.patch(f"/api/cards/{card_id}", json={"priority": None})
    assert response.status_code == 200
    c = card(auth_client, card_id)
    assert c["priority"] is None
    assert (c["due_date"], c["label"], c["assignee"], c["title"]) == ("2026-12-01", "green", "سارا", "پژوهش رقبا")


def test_blank_assignee_means_nobody(auth_client):
    card_id = first_card(auth_client)
    auth_client.patch(f"/api/cards/{card_id}", json={"assignee": "  "})
    assert card(auth_client, card_id)["assignee"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"due_date": "2026-13-01"},
        {"due_date": "tomorrow"},
        {"priority": "urgent"},
        {"label": "pink"},
        {"assignee": "x" * 51},
        {"title": None},
    ],
)
def test_update_validation(auth_client, body):
    assert auth_client.patch(f"/api/cards/{first_card(auth_client)}", json=body).status_code == 422


def test_older_database_gets_the_new_columns(db_file):
    """A database created before this feature is upgraded in place, keeping its data."""
    db_file.parent.mkdir(parents=True)
    conn = sqlite3.connect(db_file)
    conn.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
        CREATE TABLE boards (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE, title TEXT NOT NULL);
        CREATE TABLE columns (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL, title TEXT NOT NULL,
                              position INTEGER NOT NULL);
        CREATE TABLE cards (id INTEGER PRIMARY KEY, column_id INTEGER NOT NULL, title TEXT NOT NULL,
                            details TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
        INSERT INTO users VALUES (1, 'old', 'x');
        INSERT INTO cards VALUES (1, 1, 'kept', '', 0);
        """
    )
    conn.close()

    db.init_db()
    db.init_db()  # running again is harmless

    with db.connect() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(cards)")}
        assert set(db.CARD_DETAIL_COLUMNS) <= columns
        row = conn.execute("SELECT * FROM cards").fetchone()
        assert row["title"] == "kept" and row["priority"] is None
