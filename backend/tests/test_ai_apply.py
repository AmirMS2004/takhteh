import pytest

from tests.conftest import board_path

NULLS = ["card_id", "column_id", "title", "details", "index", "due_date", "priority", "assignee", "labels"]


def op(type_: str, **fields) -> dict:
    return {"type": type_} | dict.fromkeys(NULLS) | fields


def board(client) -> dict:
    return client.get(board_path(client)).json()


def apply(client, operations, board_id=None):
    board_id = board_id or board(client)["id"]
    return client.post("/api/ai/apply", json={"board_id": board_id, "operations": operations})


def undo(client, data, board_id=None):
    board_id = board_id or board(client)["id"]
    return client.post("/api/ai/undo", json={"board_id": board_id, "undo": data})


def mixed_change(b: dict) -> list[dict]:
    cols = [c["id"] for c in b["columns"]]
    first, second = b["columns"][0]["cardIds"][:2]
    red = next(label["id"] for label in b["labels"] if label["color"] == "red")
    return [
        op("create_card", column_id=cols[3], title="الف", details="d1", priority="high"),
        op("move_card", card_id=first, column_id=cols[2], index=0),
        op("update_card", card_id=second, details="جزئیات نو", due_date="2026-12-01", labels=[red], assignee="user"),
        op("move_card", card_id=second, column_id=cols[4], index=1),
    ]


def test_apply_changes_the_board_and_returns_the_undo(auth_client):
    before = board(auth_client)
    response = apply(auth_client, mixed_change(before))
    assert response.status_code == 200
    result = response.json()
    assert result["board"] == board(auth_client) != before
    first, second = before["columns"][0]["cardIds"][:2]
    data = result["undo"]
    assert len(data["created"]) == 1
    assert set(data["cards"]) == {first, second}
    assert data["cards"][second]["details"] == before["cards"][second]["details"]
    assert set(data["columns"]) == {before["columns"][i]["id"] for i in (0, 2, 3, 4)}


def test_undo_puts_the_board_back(auth_client):
    before = board(auth_client)
    data = apply(auth_client, mixed_change(before)).json()["undo"]
    response = undo(auth_client, data)
    assert response.status_code == 200
    assert response.json() == board(auth_client) == before


def test_undo_moves_within_a_column(auth_client):
    before = board(auth_client)
    col = before["columns"][0]
    ops = [op("move_card", card_id=col["cardIds"][0], column_id=col["id"], index=1)]
    data = apply(auth_client, ops).json()["undo"]
    assert undo(auth_client, data).json() == before


def test_undo_keeps_what_changed_since(auth_client):
    before = board(auth_client)
    todo = before["columns"][1]["id"]
    data = apply(auth_client, [op("create_card", column_id=todo, title="از دستیار", details="")]).json()["undo"]
    created = data["created"][0]
    auth_client.post("/api/cards", json={"column_id": todo, "title": "دستی"})
    result = undo(auth_client, data).json()
    assert created not in result["cards"]
    assert [result["cards"][i]["title"] for i in result["columns"][1]["cardIds"]][-1] == "دستی"


def test_undo_skips_cards_deleted_since(auth_client):
    before = board(auth_client)
    card = before["columns"][0]["cardIds"][0]
    data = apply(auth_client, [op("update_card", card_id=card, title="نو")]).json()["undo"]
    auth_client.delete(f"/api/cards/{card}")
    assert undo(auth_client, data).status_code == 200
    assert card not in board(auth_client)["cards"]


def test_apply_is_all_or_nothing(auth_client):
    before = board(auth_client)
    ops = [op("create_card", column_id=before["columns"][0]["id"], title="معتبر", details=""),
           op("update_card", card_id="card-999", title="x")]
    response = apply(auth_client, ops)
    assert response.status_code == 409
    assert response.json()["detail"].startswith("Changes cannot be applied")
    assert board(auth_client) == before


@pytest.mark.parametrize("operations", [[], [{"type": "delete_card", "card_id": "card-1"}]])
def test_apply_rejects_invalid_requests(auth_client, operations):
    assert apply(auth_client, operations).status_code == 422


def test_undo_rejects_invalid_data(auth_client):
    assert undo(auth_client, {"created": [], "cards": {"card-1": {"title": ""}}, "columns": {}}).status_code == 422


def test_access(client):
    assert client.post("/api/ai/apply", json={"board_id": "board-1", "operations": [op("update_card")]}).status_code == 401
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    ops = [op("update_card", card_id="card-1", title="hacked")]
    assert apply(client, ops, "board-1").status_code == 404
    assert undo(client, {"created": ["card-1"], "cards": {}, "columns": {}}, "board-1").status_code == 404
    # Ids from another board are not touched through one's own board.
    assert apply(client, ops).status_code == 409
    assert undo(client, {"created": ["card-1"], "cards": {}, "columns": {"col-1": []}}).status_code == 409
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert board(client)["cards"]["card-1"]["title"] == "پژوهش رقبا"
