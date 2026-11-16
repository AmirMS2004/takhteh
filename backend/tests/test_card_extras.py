"""Comments with mentions, checklists, the archive and the "my cards" list."""

import datetime

from app import ai, db, notifications
from app.ai_routes import board_facts
from tests.ai_helpers import FakeModel, apply, op, propose
from tests.conftest import board_path
from tests.test_notifications import kinds, login, notes, team  # noqa: F401 (fixture)


def board(client) -> dict:
    return client.get(board_path(client)).json()


def first_card(b: dict, column: int = 0, index: int = 0) -> str:
    return b["columns"][column]["cardIds"][index]


# --- comments ---


def test_comments_are_listed_oldest_first_and_counted_on_the_card(auth_client):
    card = first_card(board(auth_client))
    first = auth_client.post(f"/api/cards/{card}/comments", json={"body": "  اولی  "})
    assert first.status_code == 201
    assert first.json() | {"id": "x", "created_at": "t"} == {
        "id": "x", "author": "user", "author_avatar": 0, "body": "اولی", "created_at": "t", "mine": True,
    }
    auth_client.post(f"/api/cards/{card}/comments", json={"body": "دومی"})
    assert [c["body"] for c in auth_client.get(f"/api/cards/{card}/comments").json()] == ["اولی", "دومی"]
    assert board(auth_client)["cards"][card]["comments"] == 2
    entry = auth_client.get(f"/api/boards/{board(auth_client)['id']}/activity").json()[0]
    assert (entry["action"], entry["params"]) == ("comment_card", {"card": "پژوهش رقبا"})


def test_empty_comments_are_rejected(auth_client):
    card = first_card(board(auth_client))
    assert auth_client.post(f"/api/cards/{card}/comments", json={"body": "   "}).status_code == 422


def test_mentions_notify_members_and_the_assignee_hears_about_other_comments(client, team):
    card = first_card(team)
    client.post("/api/auth/signup", json={"username": "carol", "password": "secret123"})  # not a member
    login(client, "user", "password")
    client.post(f"/api/cards/{card}/comments", json={"body": "@Bob و @carol و @user نگاه کنید"})
    client.patch(f"/api/cards/{card}", json={"assignee": "bob"})
    client.post(f"/api/cards/{card}/comments", json={"body": "یک نظر دیگر"})
    login(client, "bob")
    found = [k for k, _ in kinds(client) if k in ("mentioned", "commented")]
    assert found == ["commented", "mentioned"]  # newest first; the mention was not doubled
    assert kinds(client)[-2] == ("mentioned", {"card": "پژوهش رقبا", "board": "تخته پروژه"})
    login(client, "carol")
    assert [k for k, _ in kinds(client)] == []  # not on the board
    login(client, "user", "password")
    assert [k for k, _ in kinds(client)] == []  # nobody hears about their own comment


def test_only_the_author_deletes_a_comment(client, team):
    card = first_card(team)
    comment = client.post(f"/api/cards/{card}/comments", json={"body": "از user"}).json()["id"]
    login(client, "bob")
    assert client.get(f"/api/cards/{card}/comments").json()[0]["mine"] is False
    assert client.delete(f"/api/comments/{comment}").status_code == 403
    login(client, "user", "password")
    assert client.delete(f"/api/comments/{comment}").status_code == 200
    assert client.get(f"/api/cards/{card}/comments").json() == []


def test_comments_are_private_to_the_board(client):
    login(client, "user", "password")
    card = first_card(board(client))
    comment = client.post(f"/api/cards/{card}/comments", json={"body": "خصوصی"}).json()["id"]
    client.post("/api/auth/signup", json={"username": "eve", "password": "secret123"})
    assert client.get(f"/api/cards/{card}/comments").status_code == 404
    assert client.post(f"/api/cards/{card}/comments", json={"body": "x"}).status_code == 404
    assert client.delete(f"/api/comments/{comment}").status_code == 404


# --- checklists ---


def test_checklist_items_are_added_ticked_renamed_and_deleted(auth_client):
    card = first_card(board(auth_client))
    a = auth_client.post(f"/api/cards/{card}/checklist", json={"text": " یک "})
    assert a.status_code == 201 and a.json() == {"id": a.json()["id"], "text": "یک", "done": False}
    b = auth_client.post(f"/api/cards/{card}/checklist", json={"text": "دو"}).json()
    auth_client.patch(f"/api/checklist/{a.json()['id']}", json={"done": True})
    auth_client.patch(f"/api/checklist/{b['id']}", json={"text": "دوم"})
    assert [(i["text"], i["done"]) for i in board(auth_client)["cards"][card]["checklist"]] == [("یک", True), ("دوم", False)]
    auth_client.delete(f"/api/checklist/{a.json()['id']}")
    auth_client.post(f"/api/cards/{card}/checklist", json={"text": "سه"})
    assert [i["text"] for i in board(auth_client)["cards"][card]["checklist"]] == ["دوم", "سه"]
    assert auth_client.post(f"/api/cards/{card}/checklist", json={"text": ""}).status_code == 422


def test_checklists_are_private_to_the_board(client):
    login(client, "user", "password")
    card = first_card(board(client))
    item = client.post(f"/api/cards/{card}/checklist", json={"text": "x"}).json()["id"]
    client.post("/api/auth/signup", json={"username": "eve", "password": "secret123"})
    assert client.post(f"/api/cards/{card}/checklist", json={"text": "y"}).status_code == 404
    assert client.patch(f"/api/checklist/{item}", json={"done": True}).status_code == 404
    assert client.delete(f"/api/checklist/{item}").status_code == 404


def test_a_restored_card_keeps_its_comments_and_checklist(auth_client):
    b = board(auth_client)
    card = first_card(b)
    auth_client.post(f"/api/cards/{card}/comments", json={"body": "نظر"})
    auth_client.post(f"/api/cards/{card}/checklist", json={"text": "مورد"})
    entry = auth_client.delete(f"/api/cards/{card}").json()["activity"]
    restored = auth_client.post(f"/api/boards/{b['id']}/activity/{entry}/restore").json()["board"]
    back = next(c for c in restored["cards"].values() if c["title"] == "پژوهش رقبا")
    assert back["comments"] == 1 and [i["text"] for i in back["checklist"]] == ["مورد"]
    assert [c["body"] for c in auth_client.get(f"/api/cards/{back['id']}/comments").json()] == ["نظر"]


def test_undoing_the_assistant_restores_checklists_and_keeps_comments(auth_client, monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(ai, "chat", model)
    card = first_card(board(auth_client))
    item = auth_client.post(f"/api/cards/{card}/checklist", json={"text": "قدیمی"}).json()["id"]
    key = propose(auth_client, model, [
        op("add_checklist_item", card_id=card, title="تازه"),
        op("update_checklist_item", item_id=item, done=True),
    ])
    assert apply(auth_client, key).status_code == 200
    assert [(i["text"], i["done"]) for i in board(auth_client)["cards"][card]["checklist"]] == [("قدیمی", True), ("تازه", False)]
    auth_client.post(f"/api/cards/{card}/comments", json={"body": "بعد از دستیار"})
    assert auth_client.post(f"/api/ai/proposals/{key}/undo").status_code == 200
    after = board(auth_client)["cards"][card]
    assert [(i["text"], i["done"]) for i in after["checklist"]] == [("قدیمی", False)]
    assert after["comments"] == 1


def test_the_assistant_can_delete_items_and_archive_cards(auth_client, monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(ai, "chat", model)
    b = board(auth_client)
    card, other = first_card(b), first_card(b, 0, 1)
    item = auth_client.post(f"/api/cards/{card}/checklist", json={"text": "حذفی"}).json()["id"]
    model.reply = {"reply": "پیشنهاد", "operations": [
        op("delete_checklist_item", item_id=item), op("update_card", card_id=other, archived=True),
    ]}
    response = auth_client.post("/api/ai/chat", json={"board_id": b["id"], "message": "x"}).json()
    assert [i["type"] for i in response["proposal"]["items"]] == ["delete_checklist_item", "update_card"]
    assert response["proposal"]["items"][0]["params"] == {"card": "پژوهش رقبا", "item": "حذفی"}
    assert response["proposal"]["items"][1]["params"] == {"card": "حالت تاریک", "archived": True}
    assert apply(auth_client, response["message_id"]).status_code == 200
    after = board(auth_client)
    assert after["cards"][card]["checklist"] == [] and other not in after["cards"]


# --- archive ---


def test_archiving_takes_a_card_off_the_board_and_restoring_puts_it_at_the_bottom(auth_client):
    b = board(auth_client)
    ideas = b["columns"][0]
    card = ideas["cardIds"][0]
    assert auth_client.patch(f"/api/cards/{card}", json={"archived": True}).json()["archived"] is True
    after = board(auth_client)
    assert card not in after["cards"] and after["columns"][0]["cardIds"] == ideas["cardIds"][1:]
    archived = auth_client.get(f"/api/boards/{b['id']}/archive").json()
    assert [(a["id"], a["title"], a["column"]) for a in archived] == [(card, "پژوهش رقبا", "ایده‌ها")]
    # Moving the others around still works with the archived card left out.
    auth_client.post(f"/api/cards/{ideas['cardIds'][2]}/move", json={"column_id": ideas["id"], "index": 0})

    auth_client.patch(f"/api/cards/{card}", json={"archived": False})
    back = board(auth_client)["columns"][0]["cardIds"]
    assert back == [ideas["cardIds"][2], ideas["cardIds"][1], card]
    assert auth_client.get(f"/api/boards/{b['id']}/archive").json() == []
    actions = [e["action"] for e in auth_client.get(f"/api/boards/{b['id']}/activity").json()]
    assert actions[0] == "unarchive_card" and "archive_card" in actions
    assert auth_client.patch(f"/api/cards/{card}", json={"archived": None}).status_code == 422


def test_archived_cards_leave_counts_due_dates_and_facts(client, team, monkeypatch):
    card = first_card(team)
    client.patch(f"/api/cards/{card}", json={"assignee": "bob", "due_date": "2026-11-10"})
    client.patch(f"/api/cards/{card}", json={"archived": True})
    summary = client.get("/api/boards").json()[0]
    assert summary["cards"] == 9
    with db.connect() as conn:
        facts = board_facts(conn, int(team["id"].split("-")[1]), datetime.date(2026, 11, 15))
    assert "پژوهش رقبا" not in facts["overdue"] and sum(facts["cards_per_column"].values()) == 9
    today = datetime.date(2026, 11, 16)
    monkeypatch.setattr(notifications.datetime, "date", type("D", (datetime.date,), {"today": staticmethod(lambda: today)}))
    login(client, "bob")
    assert [k for k, _ in kinds(client) if k == "overdue"] == []
    assert ("archive_card", {"card": "پژوهش رقبا", "board": "تخته پروژه"}) in kinds(client)


# --- my cards ---


def test_my_cards_lists_open_cards_assigned_to_me_on_all_boards(auth_client):
    b = board(auth_client)
    cards = {c["title"]: c["id"] for c in b["cards"].values()}
    other = auth_client.post("/api/boards", json={"title": "دوم"}).json()["id"]
    other_column = auth_client.get(f"/api/boards/{other}").json()["columns"][1]["id"]
    auth_client.post("/api/cards", json={"column_id": other_column, "title": "از تخته دوم", "assignee": "user", "due_date": "2026-11-01"})
    auth_client.patch(f"/api/cards/{cards['پژوهش رقبا']}", json={"assignee": "user", "due_date": "2026-12-01", "priority": "high"})
    auth_client.patch(f"/api/cards/{cards['حالت تاریک']}", json={"assignee": "user"})
    auth_client.patch(f"/api/cards/{cards['اعلان‌های ایمیلی']}", json={"assignee": "user", "done": True})
    auth_client.patch(f"/api/cards/{cards['طراحی صفحه ورود']}", json={"assignee": "user", "archived": True})
    auth_client.patch(f"/api/cards/{cards['راه‌اندازی مخزن']}", json={"assignee": "user"})  # last column
    mine = auth_client.get("/api/my-cards").json()
    assert [(c["title"], c["board_title"], c["column"], c["due_date"]) for c in mine] == [
        ("از تخته دوم", "دوم", "برای انجام", "2026-11-01"),
        ("پژوهش رقبا", "تخته پروژه", "ایده‌ها", "2026-12-01"),
        ("حالت تاریک", "تخته پروژه", "ایده‌ها", None),
    ]
    assert mine[1]["priority"] == "high" and mine[1]["board"] == b["id"]


def test_my_cards_is_per_user(client, team):
    client.patch(f"/api/cards/{first_card(team)}", json={"assignee": "bob"})
    assert client.get("/api/my-cards").json() == []
    login(client, "bob")
    assert [c["title"] for c in client.get("/api/my-cards").json()] == ["پژوهش رقبا"]


def test_older_databases_get_archived_at(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "old.db"))
    db.init_db()
    with db.connect() as conn:
        conn.execute("ALTER TABLE cards DROP COLUMN archived_at")
    db.init_db()
    with db.connect() as conn:
        assert "archived_at" in {row["name"] for row in conn.execute("PRAGMA table_info(cards)")}


def test_prompt_explains_prioritising_and_setting_up_a_board():
    from app.ai_routes import SYSTEM_PROMPT
    assert "To prioritise" in SYSTEM_PROMPT and "set up a board from a description" in SYSTEM_PROMPT
    assert notes  # imported helper stays in use


# --- the real model (pytest -m live) ---

import pytest  # noqa: E402

from tests.ai_helpers import send  # noqa: E402
from tests.conftest import AI_KEY_SET  # noqa: E402


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_sets_up_a_new_board_from_a_description(auth_client):
    new = auth_client.post("/api/boards", json={"title": "فروشگاه"}).json()["id"]
    message = "این تخته را برای این پروژه بچین: ستون‌ها، برچسب‌ها و ۸ تا ۱۵ کارت اولیه را پیشنهاد بده.\nراه‌اندازی یک فروشگاه اینترنتی لباس"
    response = send(auth_client, message, board_id=new).json()
    assert response["error"] is None and response["proposal"], response
    result = apply(auth_client, response["message_id"]).json()["board"]
    assert len(result["cards"]) >= 6, response
    assert any(label["name"] for label in result["labels"]), response


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_adds_a_checklist_to_a_card(auth_client):
    response = send(auth_client, "به کارت «حالت تاریک» یک چک‌لیست سه‌موردی برای انجامش اضافه کن.").json()
    assert response["error"] is None and response["proposal"], response
    result = apply(auth_client, response["message_id"]).json()["board"]
    card = next(c for c in result["cards"].values() if c["title"] == "حالت تاریک")
    assert len(card["checklist"]) >= 2, response


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_prioritises_without_changing_the_board(auth_client):
    response = send(auth_client, "کارهای این تخته را اولویت‌بندی کن: الان روی کدام کارها کار کنیم و چرا؟").json()
    assert response["error"] is None and response["reply"], response
    assert response["proposal"] is None, response
