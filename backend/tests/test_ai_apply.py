import pytest

from app import ai
from tests.ai_helpers import FakeModel, apply, board, op, propose, send
from tests.conftest import AI_KEY_SET


@pytest.fixture
def model(monkeypatch):
    fake = FakeModel()
    monkeypatch.setattr(ai, "chat", fake)
    return fake


def undo(client, key):
    return client.post(f"/api/ai/proposals/{key}/undo")


def reject(client, key):
    return client.post(f"/api/ai/proposals/{key}/reject")


def statuses(client) -> list[str]:
    history = client.get(f"/api/ai/history/{board(client)['id']}").json()
    return [m["proposal"]["status"] for m in history if m["proposal"]]


def big_change(b: dict) -> list[dict]:
    """A change that uses every kind of operation the assistant has."""
    cols = [c["id"] for c in b["columns"]]
    first, second = b["columns"][0]["cardIds"][:2]
    red = next(label["id"] for label in b["labels"] if label["color"] == "red")
    return [
        op("create_column", title="آزمون", index=1),
        op("create_label", name="فوری", color="orange"),
        op("create_card", column_id="new:آزمون", title="کارت تازه", details="", labels=["new:فوری"]),
        op("update_card", card_id=second, details="جزئیات نو", due_date="2026-12-01", labels=[red], assignee="user"),
        op("move_card", card_id=first, column_id=cols[2], index=0),
        op("delete_card", card_id=b["columns"][3]["cardIds"][0]),
        op("rename_column", column_id=cols[1], title="کارهای بعدی"),
        op("move_column", column_id=cols[4], index=0),
        op("delete_column", column_id=cols[3]),
        op("update_label", label_id=red, name="مهم"),
        op("delete_label", label_id=next(label["id"] for label in b["labels"] if label["color"] == "blue")),
        op("rename_board", title="تخته تازه"),
    ]


# --- proposals are stored, then applied or rejected ---


def test_a_proposal_changes_nothing_until_applied(auth_client, model):
    before = board(auth_client)
    key = propose(auth_client, model, [op("create_card", column_id=before["columns"][1]["id"], title="نو", details="")])
    assert board(auth_client) == before
    assert statuses(auth_client) == ["pending"]

    response = apply(auth_client, key)
    assert response.status_code == 200
    after = response.json()["board"]
    assert after == board(auth_client) and "نو" in [c["title"] for c in after["cards"].values()]
    assert statuses(auth_client) == ["applied"]
    assert apply(auth_client, key).status_code == 409  # only once


def test_rejecting_a_proposal(auth_client, model):
    before = board(auth_client)
    key = propose(auth_client, model, [op("delete_card", card_id="card-1")])
    assert reject(auth_client, key).status_code == 200
    assert statuses(auth_client) == ["rejected"]
    assert apply(auth_client, key).status_code == 409
    assert board(auth_client) == before


def test_the_history_shows_each_proposal_with_its_changes(auth_client, model):
    propose(auth_client, model, [op("delete_card", card_id="card-1"), op("rename_board", title="نام نو")])
    history = auth_client.get(f"/api/ai/history/{board(auth_client)['id']}").json()
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[0]["proposal"] is None
    assert history[1]["id"].startswith("msg-")
    assert history[1]["proposal"] == {
        "changes": ["حذف کارت «پژوهش رقبا»", "تغییر نام تخته به «نام نو»"],
        "items": [
            {"type": "delete_card", "params": {"card": "پژوهش رقبا"}},
            {"type": "rename_board", "params": {"title": "نام نو"}},
        ],
        "status": "pending",
    }


def test_every_operation_applies(auth_client, model):
    b = board(auth_client)
    result = apply(auth_client, propose(auth_client, model, big_change(b))).json()["board"]
    titles = [c["title"] for c in result["columns"]]
    assert result["title"] == "تخته تازه"
    assert titles == ["انجام‌شده", "ایده‌ها", "آزمون", "کارهای بعدی", "در حال انجام"]
    new_col = result["columns"][2]
    card = result["cards"][new_col["cardIds"][0]]
    urgent = next(label for label in result["labels"] if label["name"] == "فوری")
    assert card["title"] == "کارت تازه" and card["labels"] == [urgent["id"]]
    assert urgent["color"] == "orange"
    assert not any(label["color"] == "blue" for label in result["labels"])
    assert any(label["name"] == "مهم" for label in result["labels"])
    assert "بازنویسی متن‌های راهنما" not in [c["title"] for c in result["cards"].values()]


def test_the_changes_are_described_in_persian(auth_client, model):
    b = board(auth_client)
    send_ops = big_change(b)
    propose(auth_client, model, send_ops)
    changes = auth_client.get(f"/api/ai/history/{b['id']}").json()[-1]["proposal"]["changes"]
    assert changes[:3] == [
        "ستون تازه «آزمون»",
        "برچسب تازه «فوری» نارنجی",
        "کارت تازه «کارت تازه» در «آزمون» (برچسب فوری)",
    ]
    assert "سررسید ۲۰۲۶-۱۲-۰۱" in changes[3] and "مسئول user" in changes[3]
    assert changes[8] == "حذف ستون «بازبینی» با ۱ کارت"
    assert changes[-1] == "تغییر نام تخته به «تخته تازه»"


# --- undo ---


def test_undo_puts_the_whole_board_back(auth_client, model):
    before = board(auth_client)
    key = propose(auth_client, model, big_change(before))
    apply(auth_client, key)
    response = undo(auth_client, key)
    assert response.status_code == 200
    assert response.json()["board"] == board(auth_client) == before
    assert statuses(auth_client) == ["undone"]
    assert undo(auth_client, key).status_code == 409


def test_undo_is_refused_when_the_board_changed_since(auth_client, model):
    b = board(auth_client)
    key = propose(auth_client, model, [op("rename_board", title="نو")])
    apply(auth_client, key)
    auth_client.post("/api/cards", json={"column_id": b["columns"][0]["id"], "title": "دستی"})
    response = undo(auth_client, key)
    assert response.status_code == 409 and response.json()["detail"] == "The board has changed since"
    assert board(auth_client)["title"] == "نو"


def test_only_the_latest_applied_change_can_be_undone(auth_client, model):
    before = board(auth_client)
    first = propose(auth_client, model, [op("rename_board", title="یک")])
    apply(auth_client, first)
    second = propose(auth_client, model, [op("rename_board", title="دو")])
    apply(auth_client, second)
    assert undo(auth_client, first).status_code == 409
    assert undo(auth_client, second).status_code == 200
    assert undo(auth_client, first).status_code == 200  # now it is the latest
    assert board(auth_client) == before


def test_undo_brings_members_back_and_removes_added_ones(client, model):
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    client.post("/api/auth/signup", json={"username": "eve", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    path = f"/api/boards/{board(client)['id']}"
    client.post(f"{path}/members", json={"username": "bob"})
    card = board(client)["columns"][0]["cardIds"][0]
    client.patch(f"/api/cards/{card}", json={"assignee": "bob"})
    before = board(client)

    key = propose(client, model, [op("remove_member", username="bob"), op("add_member", username="eve")])
    after = apply(client, key).json()["board"]
    assert [m["username"] for m in after["members"]] == ["user", "eve"]
    assert after["cards"][card]["assignee"] is None
    undo(client, key)
    assert board(client) == before


# --- what the assistant may not do ---


@pytest.mark.parametrize(
    "bad",
    [
        op("delete_column", column_id="col-999"),
        op("create_card", column_id="new:نیست", title="x", details=""),
        op("create_label", name="بی‌رنگ"),
        op("move_column", column_id="col-1"),
        op("remove_member", username="user"),  # the user it is talking to
        op("add_member", username="nobody"),
        op("rename_column", column_id="col-1", title="x" * 201),
    ],
)
def test_invalid_changes_are_not_proposed(auth_client, model, bad):
    model.reply = {"reply": "باشه", "operations": [op("rename_board", title="معتبر"), bad]}
    response = send(auth_client).json()
    assert response["proposal"] is None and response["error"].startswith("Changes cannot be applied")


def test_a_board_keeps_one_column(auth_client, model):
    cols = [c["id"] for c in board(auth_client)["columns"]]
    model.reply = {"reply": "باشه", "operations": [op("delete_column", column_id=c) for c in cols]}
    assert send(auth_client).json()["proposal"] is None


def test_owner_only_changes_are_refused_for_members(client, model):
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    shared = board(client)["id"]
    client.post(f"/api/boards/{shared}/members", json={"username": "bob"})
    client.post("/api/auth/login", json={"username": "bob", "password": "secret123"})
    model.reply = {"reply": "باشه", "operations": [op("rename_board", title="مال من")]}
    response = send(client, board_id=shared).json()
    assert response["proposal"] is None and "owner" in response["error"]


def test_a_proposal_that_no_longer_fits_is_not_applied(auth_client, model):
    b = board(auth_client)
    card = b["columns"][0]["cardIds"][0]
    key = propose(auth_client, model, [op("rename_board", title="نو"), op("update_card", card_id=card, title="x")])
    auth_client.delete(f"/api/cards/{card}")
    response = apply(auth_client, key)
    assert response.status_code == 409
    assert board(auth_client)["title"] == b["title"]  # all or none
    assert statuses(auth_client) == ["pending"]


def test_proposals_belong_to_their_user(client, model):
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    key = propose(client, model, [op("rename_board", title="نو")])
    assert client.post("/api/auth/logout").status_code == 200
    assert apply(client, key).status_code == 401
    client.post("/api/auth/signup", json={"username": "bob", "password": "secret123"})
    assert apply(client, key).status_code == 404
    assert undo(client, key).status_code == 404
    assert reject(client, key).status_code == 404
    assert apply(client, "msg-x").status_code == 404


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_creates_a_column_and_moves_a_card_into_it(auth_client):
    response = send(auth_client, "یک ستون تازه با نام «آزمون» بساز و کارت «حالت تاریک» را به آن ببر.").json()
    assert response["error"] is None and response["proposal"], response
    result = apply(auth_client, response["message_id"]).json()["board"]
    column = next(c for c in result["columns"] if c["title"] == "آزمون")
    assert [result["cards"][k]["title"] for k in column["cardIds"]] == ["حالت تاریک"], response
