import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def db_file(tmp_path, monkeypatch):
    """Every test gets its own empty database file."""
    path = tmp_path / "data" / "app.db"
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.fixture
def client():
    with TestClient(app) as c:  # runs the lifespan, which creates and seeds the database
        yield c


@pytest.fixture
def auth_client(client):
    response = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    return client
