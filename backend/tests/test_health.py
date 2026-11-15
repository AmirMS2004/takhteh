import pytest
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Serves a tiny stand-in for the Next.js export from a temp folder."""
    (tmp_path / "index.html").write_text("<html></html>")
    (tmp_path / "_next" / "static" / "chunks").mkdir(parents=True)
    (tmp_path / "_next" / "static" / "chunks" / "x.js").write_text("1")
    mount = next(r for r in app.routes if getattr(r, "name", None) == "static")
    monkeypatch.setattr(mount, "app", StaticFiles(directory=tmp_path, html=True))
    return TestClient(app)


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_pages_must_be_revalidated(client):
    for path in ("/", "/index.html"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-cache"


def test_api_and_hashed_assets_keep_default_caching(client):
    assert "cache-control" not in client.get("/api/health").headers
    response = client.get("/_next/static/chunks/x.js")
    assert response.status_code == 200
    assert "cache-control" not in response.headers
