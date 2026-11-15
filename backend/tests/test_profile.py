import sqlite3

import pytest

from app import db
from tests.conftest import board_path


def change(client, **fields):
    return client.patch("/api/auth/profile", json=fields)


def test_profile_starts_empty(auth_client):
    assert auth_client.get("/api/auth/me").json() == {"username": "user", "name": "", "email": "", "avatar": 0}


def test_changing_name_email_and_avatar(auth_client):
    response = change(auth_client, name="  امیر  ", email="amir@example.com", avatar=3)
    assert response.status_code == 200
    assert response.json() == {"username": "user", "name": "امیر", "email": "amir@example.com", "avatar": 3}
    assert auth_client.get("/api/auth/me").json() == response.json()


def test_only_sent_fields_change(auth_client):
    change(auth_client, name="امیر", avatar=2)
    assert change(auth_client, email="a@b.co").json() == {"username": "user", "name": "امیر", "email": "a@b.co", "avatar": 2}
    assert change(auth_client, email="").json()["email"] == ""  # empty clears it


@pytest.mark.parametrize("fields", [
    {"email": "not-an-email"},
    {"email": "a@b"},
    {"avatar": -1},
    {"avatar": 9},
    {"name": "x" * 101},
    {"username": "ab"},
    {"username": "has space"},
])
def test_invalid_values_are_rejected(auth_client, fields):
    assert change(auth_client, **fields).status_code == 422


def test_changing_username_keeps_the_account(auth_client):
    path = board_path(auth_client)
    assert change(auth_client, username="Amir_1").json()["username"] == "amir_1"
    assert auth_client.get("/api/auth/me").json()["username"] == "amir_1"
    assert auth_client.get(path).status_code == 200  # same session, same boards
    auth_client.post("/api/auth/logout")
    assert auth_client.post("/api/auth/login", json={"username": "user", "password": "password"}).status_code == 401
    assert auth_client.post("/api/auth/login", json={"username": "amir_1", "password": "password"}).status_code == 200


def test_taken_username_is_rejected(client):
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert change(client, username="BOB").status_code == 409
    assert client.get("/api/auth/me").json()["username"] == "user"


def test_profile_needs_sign_in(client):
    assert change(client, name="x").status_code == 401


def test_members_show_their_avatar(auth_client):
    change(auth_client, avatar=5)
    members = auth_client.get(board_path(auth_client)).json()["members"]
    assert members == [{"username": "user", "role": "owner", "avatar": 5}]


def test_board_list_counts_cards_and_mine(client):
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    path = board_path(client)
    board = client.get(path).json()
    card = next(iter(board["cards"]))
    client.patch(f"/api/cards/{card}", json={"assignee": "user"})
    listed = client.get("/api/boards").json()[0]
    assert listed["cards"] == len(board["cards"]) and listed["my_cards"] == 1 and listed["members"] == 1


def test_older_databases_get_the_profile_columns(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)")
        conn.execute("INSERT INTO users (username, password_hash) VALUES ('old', 'x')")
    monkeypatch.setenv("DB_PATH", str(path))
    db.init_db()
    with db.connect() as conn:
        row = conn.execute("SELECT name, email, avatar FROM users WHERE username = 'old'").fetchone()
    assert tuple(row) == ("", "", 0)
