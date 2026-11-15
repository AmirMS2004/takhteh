import pytest

from tests.conftest import board_path


def board(client) -> dict:
    return client.get(board_path(client)).json()


def titles(client) -> list[str]:
    return [c["title"] for c in board(client)["columns"]]


def positions_ok(client) -> bool:
    from app import db

    with db.connect() as conn:
        rows = conn.execute("SELECT board_id, position FROM columns ORDER BY board_id, position").fetchall()
    by_board: dict[int, list[int]] = {}
    for r in rows:
        by_board.setdefault(r[0], []).append(r[1])
    return all(p == list(range(len(p))) for p in by_board.values())


def test_add_a_column_at_the_end(auth_client):
    response = auth_client.post(board_path(auth_client) + "/columns", json={"title": "  آزمون  "})
    assert response.status_code == 201
    column = response.json()
    assert (column["title"], column["cardIds"]) == ("آزمون", [])
    assert titles(auth_client)[-1] == "آزمون" and len(titles(auth_client)) == 6
    assert positions_ok(auth_client)


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_column_title_validation(auth_client, title):
    assert auth_client.post(board_path(auth_client) + "/columns", json={"title": title}).status_code == 422


def test_delete_a_column_with_its_cards(auth_client):
    b = board(auth_client)
    column = b["columns"][0]
    response = auth_client.delete(f"/api/columns/{column['id']}")
    assert response.status_code == 200
    after = board(auth_client)
    assert [c["id"] for c in after["columns"]] == [c["id"] for c in b["columns"][1:]]
    assert not set(column["cardIds"]) & set(after["cards"])
    assert positions_ok(auth_client)


def test_the_last_column_cannot_be_deleted(auth_client):
    ids = [c["id"] for c in board(auth_client)["columns"]]
    for column_id in ids[:-1]:
        assert auth_client.delete(f"/api/columns/{column_id}").status_code == 200
    assert auth_client.delete(f"/api/columns/{ids[-1]}").status_code == 409
    assert len(board(auth_client)["columns"]) == 1


@pytest.mark.parametrize("index,expected", [(0, 3), (2, 3), (4, 3), (99, 3)])
def test_move_a_column(auth_client, index, expected):
    before = [c["id"] for c in board(auth_client)["columns"]]
    moving = before[expected]
    assert auth_client.post(f"/api/columns/{moving}/move", json={"index": index}).status_code == 200
    after = [c["id"] for c in board(auth_client)["columns"]]
    rest = [c for c in before if c != moving]
    rest.insert(min(index, len(rest)), moving)
    assert after == rest
    assert positions_ok(auth_client)


def test_move_validation(auth_client):
    column = board(auth_client)["columns"][0]["id"]
    assert auth_client.post(f"/api/columns/{column}/move", json={"index": -1}).status_code == 422
    assert auth_client.post("/api/columns/col-999/move", json={"index": 0}).status_code == 404


def test_columns_of_other_boards_are_off_limits(client):
    client.post("/api/auth/signup", json={"username": "other", "password": "secret123"})
    other_path = board_path(client)
    other_column = client.get(other_path).json()["columns"][0]["id"]
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert client.delete(f"/api/columns/{other_column}").status_code == 404
    assert client.post(f"/api/columns/{other_column}/move", json={"index": 2}).status_code == 404
    assert client.post(other_path + "/columns", json={"title": "x"}).status_code == 404


def test_column_routes_require_login(client):
    assert client.post("/api/boards/board-1/columns", json={"title": "x"}).status_code == 401
    assert client.delete("/api/columns/col-1").status_code == 401
