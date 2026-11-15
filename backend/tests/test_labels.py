import sqlite3

import pytest

from app import db


def board(client) -> dict:
    return client.get("/api/board").json()


def first_card(client) -> str:
    return board(client)["columns"][0]["cardIds"][0]


def labels_of(client, card_id) -> list[str]:
    return board(client)["cards"][card_id]["labels"]


def test_board_starts_with_one_unnamed_label_per_color(auth_client):
    labels = board(auth_client)["labels"]
    assert [label["color"] for label in labels] == db.LABEL_COLORS
    assert all(label["name"] == "" and label["id"].startswith("label-") for label in labels)
    assert all(card["labels"] == [] for card in board(auth_client)["cards"].values())


def test_create_rename_recolor_and_delete_a_label(auth_client):
    created = auth_client.post("/api/labels", json={"name": "  فوری  ", "color": "red"})
    assert created.status_code == 201
    label = created.json()
    assert (label["name"], label["color"]) == ("فوری", "red")

    renamed = auth_client.patch(f"/api/labels/{label['id']}", json={"name": "باگ"}).json()
    assert (renamed["name"], renamed["color"]) == ("باگ", "red")
    recolored = auth_client.patch(f"/api/labels/{label['id']}", json={"color": "purple"}).json()
    assert (recolored["name"], recolored["color"]) == ("باگ", "purple")

    assert auth_client.delete(f"/api/labels/{label['id']}").status_code == 200
    assert label["id"] not in [x["id"] for x in board(auth_client)["labels"]]


@pytest.mark.parametrize("body", [{"color": "pink"}, {"name": "x"}, {"name": "x" * 31, "color": "red"}])
def test_label_validation(auth_client, body):
    assert auth_client.post("/api/labels", json=body).status_code == 422


def test_cards_take_several_labels_and_updates_replace_them(auth_client):
    card_id = first_card(auth_client)
    green, yellow, orange = [x["id"] for x in board(auth_client)["labels"][:3]]
    auth_client.patch(f"/api/cards/{card_id}", json={"labels": [orange, green]})
    assert labels_of(auth_client, card_id) == [green, orange]  # in label order
    auth_client.patch(f"/api/cards/{card_id}", json={"labels": [yellow]})
    assert labels_of(auth_client, card_id) == [yellow]
    auth_client.patch(f"/api/cards/{card_id}", json={"title": "x"})  # labels not sent: unchanged
    assert labels_of(auth_client, card_id) == [yellow]
    auth_client.patch(f"/api/cards/{card_id}", json={"labels": []})
    assert labels_of(auth_client, card_id) == []


def test_create_card_with_labels(auth_client):
    b = board(auth_client)
    green = b["labels"][0]["id"]
    card = auth_client.post(
        "/api/cards", json={"column_id": b["columns"][0]["id"], "title": "x", "labels": [green]}
    ).json()
    assert card["labels"] == [green]


def test_deleting_a_label_removes_it_from_cards(auth_client):
    card_id = first_card(auth_client)
    green = board(auth_client)["labels"][0]["id"]
    auth_client.patch(f"/api/cards/{card_id}", json={"labels": [green]})
    auth_client.delete(f"/api/labels/{green}")
    assert labels_of(auth_client, card_id) == []


def test_labels_belong_to_one_board(client):
    client.post("/api/auth/signup", json={"username": "other", "password": "secret123"})
    other_label = board(client)["labels"][0]["id"]
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    card_id = first_card(client)
    assert client.patch(f"/api/cards/{card_id}", json={"labels": [other_label]}).status_code == 404
    assert client.patch(f"/api/labels/{other_label}", json={"name": "hacked"}).status_code == 404
    assert client.delete(f"/api/labels/{other_label}").status_code == 404
    assert labels_of(client, card_id) == []


def test_routes_require_login(client):
    assert client.post("/api/labels", json={"color": "red"}).status_code == 401


def test_single_color_labels_from_the_previous_version_are_migrated(db_file):
    """The last version stored one color per card in cards.label; it becomes a board label."""
    db_file.parent.mkdir(parents=True)
    conn = sqlite3.connect(db_file)
    conn.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
        CREATE TABLE boards (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE, title TEXT NOT NULL);
        CREATE TABLE columns (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL, title TEXT NOT NULL,
                              position INTEGER NOT NULL);
        CREATE TABLE cards (id INTEGER PRIMARY KEY, column_id INTEGER NOT NULL, title TEXT NOT NULL,
                            details TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL,
                            due_date TEXT, priority TEXT, label TEXT, assignee TEXT);
        INSERT INTO users VALUES (1, 'old', 'x');
        INSERT INTO boards VALUES (1, 1, 'b');
        INSERT INTO columns VALUES (1, 1, 'c', 0);
        INSERT INTO cards (id, column_id, title, position, label) VALUES (1, 1, 'orange card', 0, 'orange');
        INSERT INTO cards (id, column_id, title, position) VALUES (2, 1, 'plain card', 1);
        """
    )
    conn.close()

    db.init_db()
    db.init_db()  # running again changes nothing

    with db.connect() as conn:
        assert "label" not in {row["name"] for row in conn.execute("PRAGMA table_info(cards)")}
        colors = [row["color"] for row in conn.execute("SELECT color FROM labels WHERE board_id = 1 ORDER BY id")]
        assert colors == db.LABEL_COLORS
        links = conn.execute(
            "SELECT cl.card_id, l.color FROM card_labels cl JOIN labels l ON l.id = cl.label_id"
        ).fetchall()
        assert [tuple(row) for row in links] == [(1, "orange")]
