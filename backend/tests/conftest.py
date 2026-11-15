import os
import tempfile
from pathlib import Path

import pytest

# Set before importing the app, so files created at import time (the session key) go to a temp dir.
os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp()) / "app.db")

# Live tests run when any AI provider key is configured (pass .env to the test container).
AI_KEY_SET = bool(os.environ.get("GROQ_API_KEY") or os.environ.get("OPENROUTER_API_KEY"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


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


def board_path(client) -> str:
    """API path of the signed-in user's first board."""
    return f"/api/boards/{client.get('/api/boards').json()[0]['id']}"

