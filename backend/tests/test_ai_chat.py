import json

import pytest

from app import ai
from tests.conftest import AI_KEY_SET, board_path


from tests.ai_helpers import FakeModel, apply, board, op, send, stored_operations


def label_id(b: dict, color: str) -> str:
    return next(label["id"] for label in b["labels"] if label["color"] == color)


@pytest.fixture
def model(monkeypatch):
    fake = FakeModel()
    monkeypatch.setattr(ai, "chat", fake)
    return fake


def titles(b: dict, column_index: int) -> list[str]:
    return [b["cards"][i]["title"] for i in b["columns"][column_index]["cardIds"]]


def run(client, message="سلام") -> dict:
    """Sends a message and applies the proposal it returns; the apply response."""
    proposal = send(client, message).json()
    assert proposal["error"] is None and proposal["proposal"], proposal
    response = apply(client, proposal["message_id"])
    assert response.status_code == 200, response.text
    return response.json()


# --- request to the model ---


def test_sends_board_history_and_message(auth_client, model):
    assert send(auth_client, "اول").status_code == 200  # stored, then sent as history
    assert send(auth_client, "سوم").status_code == 200
    history = [{"role": "user", "content": "اول"}, {"role": "assistant", "content": "باشه"}]

    messages = model.calls[1]["messages"]
    assert messages[0]["role"] == "system"
    assert json.dumps(board(auth_client), ensure_ascii=False) in messages[0]["content"]
    assert messages[1:] == history + [{"role": "user", "content": "سوم"}]
    schema = model.calls[1]["response_format"]["json_schema"]
    assert schema["strict"] is True
    assert schema["schema"]["required"] == ["reply", "operations"]


def test_requires_login(client, model):
    response = client.post("/api/ai/chat", json={"board_id": "board-1", "message": "سلام"})
    assert response.status_code == 401
    assert model.calls == []


@pytest.mark.parametrize(
    "body",
    [
        {"board_id": "board-1", "message": ""},
        {"board_id": "board-1", "message": "x" * 4001},
        {"message": "x"},
        {"board_id": "board-1"},
    ],
)
def test_rejects_invalid_requests(auth_client, model, body):
    assert auth_client.post("/api/ai/chat", json=body).status_code == 422


def test_missing_key_is_503(auth_client, monkeypatch):
    for name in ("AI_PROVIDER", "GROQ_API_KEY", "OPENROUTER_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    assert send(auth_client).status_code == 503


# --- replies without changes ---


def test_reply_without_operations_leaves_board_unchanged(auth_client, model):
    before = board(auth_client)
    response = send(auth_client).json()
    assert response == {"reply": "باشه", "message_id": response["message_id"], "proposal": None, "error": None}
    assert board(auth_client) == before


# --- proposals ---


def test_changes_are_proposed_not_applied(auth_client, model):
    before = board(auth_client)
    todo = before["columns"][1]["id"]
    model.reply["operations"] = [op("create_card", column_id=todo, title="نوشتن تست", details="")]
    response = send(auth_client).json()
    assert response["error"] is None
    assert response["proposal"] == {"changes": ["کارت تازه «نوشتن تست» در «برای انجام»"], "status": "pending"}
    assert stored_operations(response["message_id"]) == [op("create_card", column_id=todo, title="نوشتن تست", details="")]
    assert board(auth_client) == before


# --- each operation, once applied ---


def test_create_card(auth_client, model):
    todo = board(auth_client)["columns"][1]["id"]
    model.reply["operations"] = [op("create_card", column_id=todo, title=" نوشتن تست ", details="")]
    result = run(auth_client)["board"]
    assert titles(result, 1)[-1] == "نوشتن تست"
    assert result == board(auth_client)


def test_update_card_keeps_null_fields(auth_client, model):
    b = board(auth_client)
    card_id = b["columns"][0]["cardIds"][0]
    model.reply["operations"] = [op("update_card", card_id=card_id, title="عنوان تازه")]
    card = run(auth_client)["board"]["cards"][card_id]
    assert card["title"] == "عنوان تازه"
    assert card["details"] == b["cards"][card_id]["details"]


def test_move_card(auth_client, model):
    b = board(auth_client)
    card_id, done = b["columns"][0]["cardIds"][0], b["columns"][4]["id"]
    model.reply["operations"] = [op("move_card", card_id=card_id, column_id=done, index=0)]
    result = run(auth_client)["board"]
    assert titles(result, 4)[0] == "پژوهش رقبا"
    assert "پژوهش رقبا" not in titles(result, 0)


def test_move_card_with_null_index_goes_to_bottom(auth_client, model):
    b = board(auth_client)
    card_id, done = b["columns"][0]["cardIds"][0], b["columns"][4]["id"]
    model.reply["operations"] = [op("move_card", card_id=card_id, column_id=done)]
    assert titles(run(auth_client)["board"], 4)[-1] == "پژوهش رقبا"


def test_several_operations_apply_in_order(auth_client, model):
    b = board(auth_client)
    cols = [c["id"] for c in b["columns"]]
    first, second = b["columns"][0]["cardIds"][:2]
    model.reply["operations"] = [
        op("create_card", column_id=cols[3], title="الف", details="d1"),
        op("create_card", column_id=cols[3], title="ب", details=""),
        op("move_card", card_id=first, column_id=cols[2], index=0),
        op("update_card", card_id=second, details="جزئیات نو"),
    ]
    result = run(auth_client)["board"]
    assert titles(result, 3) == ["بازنویسی متن‌های راهنما", "الف", "ب"]
    assert titles(result, 2)[0] == "پژوهش رقبا"
    assert result["cards"][second]["details"] == "جزئیات نو"


def test_prompt_includes_today(auth_client, model):
    import datetime

    send(auth_client)
    assert f"Today is {datetime.date.today().isoformat()}" in model.calls[0]["messages"][0]["content"]


def test_create_and_update_card_details(auth_client, model):
    b = board(auth_client)
    todo, first = b["columns"][1]["id"], b["columns"][0]["cardIds"][0]
    model.reply["operations"] = [
        op("create_card", column_id=todo, title="گزارش", details="", due_date="2026-12-05", priority="high"),
        op("update_card", card_id=first, labels=[label_id(b, "red")], assignee="user"),
    ]
    result = run(auth_client)["board"]
    created = result["cards"][result["columns"][1]["cardIds"][-1]]
    assert (created["title"], created["due_date"], created["priority"]) == ("گزارش", "2026-12-05", "high")
    assert (result["cards"][first]["labels"], result["cards"][first]["assignee"]) == ([label_id(b, "red")], "user")
    assert result["cards"][first]["title"] == "پژوهش رقبا"  # null kept the title


@pytest.mark.parametrize("bad", [{"priority": "urgent"}, {"labels": "red"}, {"due_date": "next week"}])
def test_invalid_detail_values_are_malformed_output(auth_client, model, bad):
    model.reply["operations"] = [op("update_card", card_id="card-1", **bad)]
    assert send(auth_client).status_code == 502


def test_unknown_label_rolls_back(auth_client, model):
    before = board(auth_client)
    model.reply["operations"] = [op("update_card", card_id="card-1", labels=["label-999"])]
    response = send(auth_client).json()
    assert response["error"].startswith("Changes cannot be applied") and response["proposal"] is None
    assert board(auth_client) == before


def test_prompt_lists_the_board_labels(auth_client, model):
    send(auth_client)
    assert '"labels": [{"id": "label-1"' in model.calls[0]["messages"][0]["content"]


# --- invalid changes are not proposed, and the board is untouched ---


@pytest.mark.parametrize(
    "bad",
    [
        op("update_card", card_id="card-999", title="x"),
        op("move_card", card_id="card-1", column_id="col-999", index=0),
        op("create_card", column_id="col-1", title="  "),
        op("create_card", title="no column"),
        op("update_card", card_id="card-1", title=""),
        op("move_card", card_id="card-1", column_id="col-2", index=-1),
    ],
)
def test_invalid_operation_rolls_back_everything(auth_client, model, bad):
    before = board(auth_client)
    model.reply["operations"] = [op("create_card", column_id="col-1", title="معتبر", details=""), bad]
    response = send(auth_client).json()
    assert response["proposal"] is None
    assert response["error"].startswith("Changes cannot be applied")
    assert response["reply"] == "باشه"
    assert before == board(auth_client)


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        '{"reply": "x"}',
        '{"reply": "x", "operations": [{"type": "drop_table"}]}',
    ],
)
def test_malformed_model_output_is_502(auth_client, model, raw):
    before = board(auth_client)
    model.reply = raw
    assert send(auth_client).status_code == 502
    assert board(auth_client) == before


def test_cannot_touch_another_users_board(client, model):
    from app import db

    with db.connect() as conn:
        db.create_user(conn, "other", "secret")
    client.post("/api/auth/login", json={"username": "other", "password": "secret"})
    model.reply["operations"] = [op("update_card", card_id="card-1", title="hacked")]
    assert send(client).json()["error"].startswith("Changes cannot be applied")
    assert apply(client, "msg-1").status_code == 404
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert board(client)["cards"]["card-1"]["title"] == "پژوهش رقبا"


# --- live ---


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_creates_card(auth_client):
    response = send(auth_client, "یک کارت با عنوان «تست زنده» در ستون «برای انجام» بساز.")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["error"] is None, body
    assert body["reply"]
    assert "تست زنده" in titles(apply(auth_client, body["message_id"]).json()["board"], 1), body


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_moves_card_and_answers_questions(auth_client):
    body = run(auth_client, "کارت «پژوهش رقبا» را به ستون «انجام‌شده» منتقل کن.")
    assert "پژوهش رقبا" in titles(body["board"], 4), body

    body = send(auth_client, "ستون «در حال انجام» چند کارت دارد؟").json()
    assert body["proposal"] is None and body["error"] is None, body
    assert body["reply"]


@pytest.mark.live
@pytest.mark.skipif(not AI_KEY_SET, reason="no AI provider key set")
def test_live_sets_card_details(auth_client):
    body = run(auth_client, "برای کارت «پژوهش رقبا» اولویت را بالا و برچسب را قرمز بگذار و مسئولش را «user» کن.")
    research = next(c for c in body["board"]["cards"].values() if c["title"] == "پژوهش رقبا")
    red = label_id(body["board"], "red")
    assert (research["priority"], research["labels"], research["assignee"]) == ("high", [red], "user"), body
