import pytest

from app import db
from tests.conftest import board_path


def signup(client, username="alice", password="secret123"):
    return client.post("/api/auth/signup", json={"username": username, "password": password})


def login(client, username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password})


# --- sign-up ---


def test_signup_creates_account_signs_in_and_gives_empty_board(client):
    response = signup(client)
    assert response.status_code == 201
    assert response.json() == {"username": "alice"}
    assert client.get("/api/auth/me").json() == {"username": "alice"}

    board = client.get(board_path(client)).json()
    assert [c["title"] for c in board["columns"]] == db.DEFAULT_COLUMNS
    assert board["cards"] == {}


def test_signup_password_is_hashed(client):
    signup(client)
    with db.connect() as conn:
        stored = conn.execute("SELECT password_hash FROM users WHERE username = 'alice'").fetchone()[0]
    assert "secret123" not in stored


def test_new_user_can_log_in_later(client):
    signup(client)
    client.post("/api/auth/logout")
    assert login(client, "alice", "secret123").status_code == 200
    assert login(client, "alice", "wrong-pass").status_code == 401


@pytest.mark.parametrize("taken", ["user", "USER", "User"])
def test_signup_rejects_taken_username_case_insensitively(client, taken):
    response = signup(client, taken)
    assert response.status_code == 409
    assert "set-cookie" not in response.headers


def test_usernames_are_stored_lowercase_and_login_ignores_case(client):
    assert signup(client, "Bob_99").json() == {"username": "bob_99"}
    client.post("/api/auth/logout")
    assert login(client, "BOB_99", "secret123").json() == {"username": "bob_99"}


@pytest.mark.parametrize(
    "username,password",
    [
        ("ab", "secret123"),  # too short
        ("a" * 33, "secret123"),  # too long
        ("has space", "secret123"),
        ("علی", "secret123"),  # only English letters, digits, _
        (" alice", "secret123"),
        ("alice", "short"),  # password under 8
        ("alice", "x" * 129),
    ],
)
def test_signup_validation(client, username, password):
    assert signup(client, username, password).status_code == 422


def test_users_only_see_their_own_board(client):
    signup(client)
    client.post("/api/cards", json={"column_id": client.get(board_path(client)).json()["columns"][0]["id"], "title": "x"})
    client.post("/api/auth/logout")
    login(client, "user", "password")
    titles = [c["title"] for c in client.get(board_path(client)).json()["cards"].values()]
    assert "x" not in titles and len(titles) == len(db.DEMO_CARDS)


# --- password change ---


def change(client, current, new):
    return client.post("/api/auth/password", json={"current_password": current, "new_password": new})


def test_change_password(auth_client):
    assert change(auth_client, "password", "new-password").status_code == 200
    auth_client.post("/api/auth/logout")
    assert login(auth_client, "user", "password").status_code == 401
    assert login(auth_client, "user", "new-password").status_code == 200


def test_change_password_needs_correct_current_password(auth_client):
    assert change(auth_client, "wrong", "new-password").status_code == 403
    auth_client.post("/api/auth/logout")
    assert login(auth_client, "user", "password").status_code == 200


def test_change_password_validates_new_password(auth_client):
    assert change(auth_client, "password", "short").status_code == 422


def test_change_password_requires_login(client):
    assert change(client, "password", "new-password").status_code == 401
