import pytest

from app import ai
from tests.ai_helpers import FakeModel, apply, op, propose
from tests.conftest import board_path


def board(client) -> dict:
    return client.get(board_path(client)).json()


def activity(client, **params) -> list[dict]:
    response = client.get(f"/api/boards/{board(client)['id']}/activity", params=params)
    assert response.status_code == 200
    return response.json()


def summaries(client, **params) -> list[str]:
    return [e["summary"] for e in activity(client, **params)]


def restore(client, entry):
    return client.post(f"/api/boards/{board(client)['id']}/activity/{entry}/restore")


def card_id(b: dict, title: str) -> str:
    return next(k for k, c in b["cards"].items() if c["title"] == title)


# --- the log ---


def test_changes_are_logged_newest_first_with_who_and_when(auth_client):
    b = board(auth_client)
    todo, done = b["columns"][1]["id"], b["columns"][4]["id"]
    new = auth_client.post("/api/cards", json={"column_id": todo, "title": "تازه"}).json()["id"]
    auth_client.patch(f"/api/cards/{new}", json={"priority": "high", "due_date": "2026-12-01"})
    auth_client.post(f"/api/cards/{new}/move", json={"column_id": done, "index": 0})
    auth_client.delete(f"/api/cards/{new}")
    entries = activity(auth_client)
    assert [e["summary"] for e in entries] == [
        "کارت «تازه» را از «انجام‌شده» حذف کرد",
        "کارت «تازه» را از «برای انجام» به «انجام‌شده» برد",
        "کارت «تازه» را ویرایش کرد: سررسید، اولویت",
        "کارت «تازه» را در «برای انجام» ساخت",
    ]
    assert {e["user"] for e in entries} == {"user"}
    assert entries[0]["id"].startswith("act-") and entries[0]["created_at"]
    assert [e["restorable"] for e in entries] == [True, False, False, False]


def test_columns_labels_board_and_members_are_logged(client):
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    b = board(client)
    col = client.post(f"/api/boards/{b['id']}/columns", json={"title": "تازه"}).json()["id"]
    client.patch(f"/api/columns/{col}", json={"title": "نو"})
    client.post(f"/api/columns/{col}/move", json={"index": 0})
    client.delete(f"/api/columns/{col}")
    label = client.post(f"/api/boards/{b['id']}/labels", json={"name": "فوری", "color": "red"}).json()["id"]
    client.patch(f"/api/labels/{label}", json={"name": "خیلی فوری"})
    client.delete(f"/api/labels/{label}")
    client.patch(f"/api/boards/{b['id']}", json={"title": "تخته تازه"})
    client.post(f"/api/boards/{b['id']}/members", json={"username": "bob"})
    client.delete(f"/api/boards/{b['id']}/members/bob")
    assert summaries(client) == [
        "bob را از اعضا حذف کرد",
        "bob را به اعضا افزود",
        "نام تخته را از «تخته پروژه» به «تخته تازه» تغییر داد",
        "برچسب «خیلی فوری» را حذف کرد",
        "برچسب «فوری» را ویرایش کرد",
        "برچسب «فوری» را ساخت",
        "ستون «نو» را حذف کرد",
        "ستون «نو» را جابه‌جا کرد",
        "نام ستون «تازه» را به «نو» تغییر داد",
        "ستون «تازه» را ساخت",
    ]


def test_changes_that_change_nothing_are_not_logged(auth_client):
    b = board(auth_client)
    first = b["columns"][0]
    auth_client.patch(f"/api/cards/{first['cardIds'][0]}", json={"title": b["cards"][first["cardIds"][0]]["title"]})
    auth_client.post(f"/api/cards/{first['cardIds'][0]}/move", json={"column_id": first["id"], "index": 1})  # reorder
    auth_client.patch(f"/api/columns/{first['id']}", json={"title": first["title"]})
    assert activity(auth_client) == []


def test_a_card_has_its_own_history(auth_client):
    b = board(auth_client)
    card = b["columns"][0]["cardIds"][0]
    other = b["columns"][0]["cardIds"][1]
    auth_client.patch(f"/api/cards/{card}", json={"title": "نام نو"})
    auth_client.patch(f"/api/cards/{other}", json={"details": "x"})
    assert summaries(auth_client, card=card) == ["کارت «پژوهش رقبا» را ویرایش کرد: عنوان (عنوان تازه «نام نو»)"]


def test_changes_by_the_assistant_are_marked(auth_client, monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(ai, "chat", model)
    apply(auth_client, propose(auth_client, model, [op("rename_board", title="از دستیار")]))
    entry = activity(auth_client)[0]
    assert entry["via"] == "assistant" and entry["user"] == "user"


# --- restoring ---


def test_a_deleted_card_comes_back_as_it_was(client):
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    b = board(client)
    client.post(f"/api/boards/{b['id']}/members", json={"username": "bob"})
    card = b["columns"][0]["cardIds"][1]
    red = next(label["id"] for label in b["labels"] if label["color"] == "red")
    client.patch(f"/api/cards/{card}", json={"labels": [red], "assignee": "bob", "priority": "low"})
    before = board(client)

    response = client.delete(f"/api/cards/{card}")
    entry = response.json()["activity"]
    assert card not in board(client)["cards"]
    restored = restore(client, entry)
    assert restored.status_code == 200
    assert restored.json()["board"] == board(client) == before  # same id, place, labels and assignee
    assert summaries(client)[0] == "کارت «حالت تاریک» را بازگرداند"
    assert restore(client, entry).status_code == 409


def test_a_card_whose_column_is_gone_comes_back_in_the_first_column(auth_client):
    b = board(auth_client)
    review = b["columns"][3]
    entry = auth_client.delete(f"/api/cards/{review['cardIds'][0]}").json()["activity"]
    auth_client.delete(f"/api/columns/{review['id']}")
    after = restore(auth_client, entry).json()["board"]
    # It keeps its place (it was at the top), in the first column.
    assert after["cards"][after["columns"][0]["cardIds"][0]]["title"] == "بازنویسی متن‌های راهنما"


def test_a_deleted_column_comes_back_with_its_cards(auth_client):
    before = board(auth_client)
    doing = before["columns"][2]["id"]
    entry = auth_client.delete(f"/api/columns/{doing}").json()["activity"]
    assert summaries(auth_client)[0] == "ستون «در حال انجام» را با ۲ کارت حذف کرد"
    assert restore(auth_client, entry).json()["board"] == before


def test_a_deleted_label_comes_back_on_its_cards(auth_client):
    b = board(auth_client)
    red = next(label["id"] for label in b["labels"] if label["color"] == "red")
    card = b["columns"][0]["cardIds"][0]
    auth_client.patch(f"/api/cards/{card}", json={"labels": [red]})
    before = board(auth_client)
    entry = auth_client.delete(f"/api/labels/{red}").json()["activity"]
    assert board(auth_client)["cards"][card]["labels"] == []
    assert restore(auth_client, entry).json()["board"] == before


def test_the_deleted_filter_lists_what_can_be_restored(auth_client):
    b = board(auth_client)
    first = auth_client.delete(f"/api/cards/{b['columns'][0]['cardIds'][0]}").json()["activity"]
    auth_client.delete(f"/api/cards/{b['columns'][0]['cardIds'][1]}")
    restore(auth_client, first)
    deleted = activity(auth_client, deleted="true")
    assert [e["summary"] for e in deleted] == ["کارت «حالت تاریک» را از «ایده‌ها» حذف کرد"]


def test_only_deletions_can_be_restored(auth_client):
    b = board(auth_client)
    auth_client.patch(f"/api/boards/{b['id']}", json={"title": "x"})
    assert restore(auth_client, activity(auth_client)[0]["id"]).status_code == 404
    assert restore(auth_client, "act-999").status_code == 404
    assert restore(auth_client, "nonsense").status_code == 404


def test_access(client):
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    b = board(client)
    entry = client.delete(f"/api/cards/{b['columns'][0]['cardIds'][0]}").json()["activity"]
    other = client.post("/api/boards", json={"title": "دیگری"}).json()["id"]
    assert client.post(f"/api/boards/{other}/activity/{entry}/restore").status_code == 404  # not this board's
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    assert client.get(f"/api/boards/{b['id']}/activity").status_code == 404
    assert client.post(f"/api/boards/{b['id']}/activity/{entry}/restore").status_code == 404
    client.post("/api/auth/logout")
    assert client.get(f"/api/boards/{b['id']}/activity").status_code == 401


def test_restoring_is_announced_live(auth_client):
    b = board(auth_client)
    entry = auth_client.delete(f"/api/cards/{b['columns'][0]['cardIds'][0]}").json()["activity"]
    with auth_client.websocket_connect(f"/api/boards/{b['id']}/live") as ws:
        restore(auth_client, entry)
        assert ws.receive_json()["type"] == "board_changed"


@pytest.mark.parametrize("kind", ["card", "column", "label"])
def test_delete_routes_return_the_log_entry(auth_client, kind):
    b = board(auth_client)
    target = {"card": b["columns"][0]["cardIds"][0], "column": b["columns"][0]["id"], "label": b["labels"][0]["id"]}[kind]
    response = auth_client.delete(f"/api/{kind}s/{target}").json()
    assert response["ok"] is True and response["activity"] == activity(auth_client)[0]["id"]
