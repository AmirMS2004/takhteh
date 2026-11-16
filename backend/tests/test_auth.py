import pytest

from app import db


def test_session_for_deleted_user_is_rejected(auth_client):
    with db.connect() as conn:
        conn.execute("DELETE FROM users")
    assert auth_client.get("/api/auth/me").status_code == 401


def login(client, username="user", password="password"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_login_success_sets_httponly_cookie(client):
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("session=")
    assert "httponly" in cookie.lower()


@pytest.mark.parametrize("username,password", [("user", "wrong"), ("other", "password"), ("", "")])
def test_login_rejects_bad_credentials(client, username, password):
    response = login(client, username, password)
    assert response.status_code == 401
    assert "set-cookie" not in response.headers


def test_login_requires_body(client):
    assert client.post("/api/auth/login", json={}).status_code == 422


def test_me_without_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_with_session(client):
    login(client)
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user", "name": "", "email": "", "avatar": 0, "language": "fa"}


def test_logout_ends_session(client):
    login(client)
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_tampered_cookie_is_rejected(client):
    client.cookies.set("session", "forged-value")
    assert client.get("/api/auth/me").status_code == 401
