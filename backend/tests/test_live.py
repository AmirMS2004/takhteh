import pytest
from starlette.websockets import WebSocketDisconnect

from app import ai
from tests.ai_helpers import FakeModel, apply, op, propose
from tests.conftest import board_path


def live(client, board_id):
    return client.websocket_connect(f"/api/boards/{board_id}/live")


def changed(event, board_id, origin=None):
    return event == {"type": "board_changed", "board": board_id, "origin": origin}


def test_a_change_is_announced_to_the_boards_clients(auth_client):
    b = auth_client.get(board_path(auth_client)).json()
    with live(auth_client, b["id"]) as ws:
        auth_client.post(
            "/api/cards", json={"column_id": b["columns"][0]["id"], "title": "تازه"}, headers={"X-Client-Id": "tab-1"}
        )
        assert changed(ws.receive_json(), b["id"], "tab-1")
        auth_client.patch(f"/api/columns/{b['columns'][0]['id']}", json={"title": "نام نو"})
        assert changed(ws.receive_json(), b["id"])


@pytest.mark.parametrize(
    "write",
    [
        lambda c, b: c.post(f"/api/cards/{b['columns'][0]['cardIds'][0]}/move", json={"column_id": b["columns"][1]["id"], "index": 0}),
        lambda c, b: c.delete(f"/api/cards/{b['columns'][0]['cardIds'][0]}"),
        lambda c, b: c.post(f"/api/boards/{b['id']}/columns", json={"title": "ستون"}),
        lambda c, b: c.post(f"/api/columns/{b['columns'][0]['id']}/move", json={"index": 2}),
        lambda c, b: c.delete(f"/api/columns/{b['columns'][0]['id']}"),
        lambda c, b: c.post(f"/api/boards/{b['id']}/labels", json={"name": "x", "color": "red"}),
        lambda c, b: c.patch(f"/api/labels/{b['labels'][0]['id']}", json={"name": "y"}),
        lambda c, b: c.delete(f"/api/labels/{b['labels'][0]['id']}"),
        lambda c, b: c.patch(f"/api/boards/{b['id']}", json={"title": "نام"}),
        lambda c, b: c.patch("/api/auth/profile", json={"avatar": 3}),
    ],
)
def test_every_kind_of_write_is_announced(auth_client, write):
    b = auth_client.get(board_path(auth_client)).json()
    with live(auth_client, b["id"]) as ws:
        assert write(auth_client, b).status_code in (200, 201)
        assert changed(ws.receive_json(), b["id"])


def test_reads_and_failed_writes_are_not_announced(auth_client):
    b = auth_client.get(board_path(auth_client)).json()
    with live(auth_client, b["id"]) as ws:
        auth_client.get(board_path(auth_client))
        assert auth_client.post("/api/cards", json={"column_id": "col-999", "title": "x"}).status_code == 404
        auth_client.patch(f"/api/boards/{b['id']}", json={"title": "علامت"})  # the next event must be this one
        assert ws.receive_json()["type"] == "board_changed"
        assert auth_client.get(board_path(auth_client)).json()["title"] == "علامت"


def test_the_assistant_announces_only_applied_changes(auth_client, monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(ai, "chat", model)
    b = auth_client.get(board_path(auth_client)).json()
    with live(auth_client, b["id"]) as ws:
        key = propose(auth_client, model, [op("rename_board", title="از دستیار")])  # dry run: nothing announced
        apply(auth_client, key)
        assert changed(ws.receive_json(), b["id"])
        assert auth_client.get(board_path(auth_client)).json()["title"] == "از دستیار"


def test_other_boards_are_not_told(auth_client):
    first = auth_client.get(board_path(auth_client)).json()
    second = auth_client.post("/api/boards", json={"title": "دوم"}).json()["id"]
    with live(auth_client, second) as ws:
        auth_client.post("/api/cards", json={"column_id": first["columns"][0]["id"], "title": "x"})
        auth_client.patch(f"/api/boards/{second}", json={"title": "دوم نو"})
        assert changed(ws.receive_json(), second)  # the first board's change never arrived


def test_members_see_each_others_changes(client):
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    b = client.get(board_path(client)).json()
    client.post(f"/api/boards/{b['id']}/members", json={"username": "bob"})
    with live(client, b["id"]) as ws:  # user's tab
        client.post("/api/auth/login", json={"username": "bob", "password": "secret123"})
        client.post("/api/cards", json={"column_id": b["columns"][0]["id"], "title": "از bob"})
        assert changed(ws.receive_json(), b["id"])


def test_only_members_can_listen(client):
    with pytest.raises(WebSocketDisconnect):
        with live(client, "board-1") as ws:
            ws.receive_json()
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    with pytest.raises(WebSocketDisconnect):
        with live(client, "board-1") as ws:  # user's board
            ws.receive_json()
    with pytest.raises(WebSocketDisconnect):
        with live(client, "nonsense") as ws:
            ws.receive_json()


def test_closed_clients_are_forgotten(auth_client):
    from app.live import hub

    b = auth_client.get(board_path(auth_client)).json()
    with live(auth_client, b["id"]):
        assert len(hub.clients[int(b["id"].split("-")[1])]) == 1
    auth_client.patch(f"/api/boards/{b['id']}", json={"title": "بعد"})
    assert not hub.clients[int(b["id"].split("-")[1])]
