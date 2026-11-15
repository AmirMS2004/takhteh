import pytest

from app import db
from tests.conftest import board_path


def board(client) -> dict:
    response = client.get(board_path(client))
    assert response.status_code == 200
    return response.json()


def column(client, index: int) -> dict:
    return board(client)["columns"][index]


def titles(client, index: int) -> list[str]:
    b = board(client)
    return [b["cards"][card_id]["title"] for card_id in b["columns"][index]["cardIds"]]


def move(client, card_id: str, column_id: str, index: int):
    return client.post(f"/api/cards/{card_id}/move", json={"column_id": column_id, "index": index})


def assert_positions_contiguous():
    with db.connect() as conn:
        for (column_id,) in conn.execute("SELECT id FROM columns").fetchall():
            rows = conn.execute(
                "SELECT position FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
            ).fetchall()
            assert [r[0] for r in rows] == list(range(len(rows)))


# --- reading ---


def test_board_has_seeded_shape(auth_client):
    b = board(auth_client)
    assert [c["title"] for c in b["columns"]] == db.DEFAULT_COLUMNS
    assert all(c["id"].startswith("col-") for c in b["columns"])
    assert len(b["cards"]) == len(db.DEMO_CARDS)
    for card_id, card in b["cards"].items():
        assert card_id.startswith("card-") and card["id"] == card_id
    assert titles(auth_client, 0) == ["پژوهش رقبا", "حالت تاریک", "اعلان‌های ایمیلی"]


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/api/boards", None),
        ("patch", "/api/columns/col-1", {"title": "x"}),
        ("post", "/api/cards", {"column_id": "col-1", "title": "x"}),
        ("patch", "/api/cards/card-1", {"title": "x"}),
        ("post", "/api/cards/card-1/move", {"column_id": "col-1", "index": 0}),
        ("delete", "/api/cards/card-1", None),
    ],
)
def test_routes_require_login(client, method, path, body):
    kwargs = {"json": body} if body is not None else {}
    assert client.request(method.upper(), path, **kwargs).status_code == 401


# --- columns ---


def test_rename_column(auth_client):
    col = column(auth_client, 1)
    response = auth_client.patch(f"/api/columns/{col['id']}", json={"title": "  اسپرینت  "})
    assert response.status_code == 200
    assert column(auth_client, 1)["title"] == "اسپرینت"


def test_rename_column_rejects_empty_title(auth_client):
    col = column(auth_client, 1)
    assert auth_client.patch(f"/api/columns/{col['id']}", json={"title": "   "}).status_code == 422


@pytest.mark.parametrize("column_id", ["col-999", "card-1", "col-abc", "1", "col-"])
def test_rename_unknown_column(auth_client, column_id):
    assert auth_client.patch(f"/api/columns/{column_id}", json={"title": "x"}).status_code == 404


# --- cards ---


def test_create_card_appends_to_column(auth_client):
    col = column(auth_client, 3)
    response = auth_client.post(
        "/api/cards", json={"column_id": col["id"], "title": "کارت تازه", "details": "توضیح"}
    )
    assert response.status_code == 201
    card = response.json()
    assert card["title"] == "کارت تازه" and card["details"] == "توضیح"
    assert column(auth_client, 3)["cardIds"][-1] == card["id"]
    assert_positions_contiguous()


def test_create_card_defaults_details(auth_client):
    col = column(auth_client, 0)
    response = auth_client.post("/api/cards", json={"column_id": col["id"], "title": "x"})
    assert response.json()["details"] == ""


def test_create_card_validation(auth_client):
    col = column(auth_client, 0)
    assert auth_client.post("/api/cards", json={"column_id": col["id"], "title": ""}).status_code == 422
    assert auth_client.post("/api/cards", json={"column_id": "col-999", "title": "x"}).status_code == 404


def test_update_card_partial(auth_client):
    card_id = column(auth_client, 0)["cardIds"][0]
    response = auth_client.patch(f"/api/cards/{card_id}", json={"title": "عنوان نو"})
    assert response.status_code == 200
    card = board(auth_client)["cards"][card_id]
    assert card["title"] == "عنوان نو"
    assert card["details"] == "بررسی سه محصول رقیب و جمع‌بندی نقاط قوت و ضعف."

    auth_client.patch(f"/api/cards/{card_id}", json={"details": ""})
    card = board(auth_client)["cards"][card_id]
    assert (card["title"], card["details"]) == ("عنوان نو", "")


def test_update_unknown_card(auth_client):
    assert auth_client.patch("/api/cards/card-999", json={"title": "x"}).status_code == 404


def test_delete_card_renumbers_column(auth_client):
    first = column(auth_client, 0)["cardIds"][0]
    assert auth_client.delete(f"/api/cards/{first}").status_code == 200
    assert first not in board(auth_client)["cards"]
    assert titles(auth_client, 0) == ["حالت تاریک", "اعلان‌های ایمیلی"]
    assert_positions_contiguous()
    assert auth_client.delete(f"/api/cards/{first}").status_code == 404


# --- moving ---


def test_move_down_within_column(auth_client):
    col = column(auth_client, 0)
    assert move(auth_client, col["cardIds"][0], col["id"], 2).status_code == 200
    assert titles(auth_client, 0) == ["حالت تاریک", "اعلان‌های ایمیلی", "پژوهش رقبا"]
    assert_positions_contiguous()


def test_move_up_within_column(auth_client):
    col = column(auth_client, 0)
    move(auth_client, col["cardIds"][2], col["id"], 0)
    assert titles(auth_client, 0) == ["اعلان‌های ایمیلی", "پژوهش رقبا", "حالت تاریک"]


def test_move_between_columns(auth_client):
    source, target = column(auth_client, 0), column(auth_client, 1)
    move(auth_client, source["cardIds"][1], target["id"], 1)
    assert titles(auth_client, 0) == ["پژوهش رقبا", "اعلان‌های ایمیلی"]
    assert titles(auth_client, 1) == ["طراحی صفحه ورود", "حالت تاریک", "تعریف شاخص‌ها"]
    assert_positions_contiguous()


def test_move_into_empty_column(auth_client):
    review = column(auth_client, 3)
    auth_client.delete(f"/api/cards/{review['cardIds'][0]}")
    card_id = column(auth_client, 2)["cardIds"][0]
    move(auth_client, card_id, review["id"], 0)
    assert titles(auth_client, 3) == ["پیاده‌سازی API کاربران"]
    assert titles(auth_client, 2) == ["بهبود سرعت بارگذاری"]
    assert_positions_contiguous()


def test_move_index_past_end_appends(auth_client):
    card_id = column(auth_client, 0)["cardIds"][0]
    move(auth_client, card_id, column(auth_client, 4)["id"], 99)
    assert titles(auth_client, 4)[-1] == "پژوهش رقبا"
    assert_positions_contiguous()


def test_move_validation(auth_client):
    col = column(auth_client, 0)
    assert move(auth_client, col["cardIds"][0], col["id"], -1).status_code == 422
    assert move(auth_client, col["cardIds"][0], "col-999", 0).status_code == 404
    assert move(auth_client, "card-999", col["id"], 0).status_code == 404


# --- isolation between users ---


def test_users_cannot_touch_each_others_boards(client):
    with db.connect() as conn:
        db.create_user(conn, "other", "secret")
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    user_board = board(client)
    user_card = user_board["columns"][0]["cardIds"][0]
    user_column = user_board["columns"][0]["id"]

    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "other", "password": "secret"})
    other_board = board(client)
    assert other_board["cards"] == {}
    assert {c["id"] for c in other_board["columns"]}.isdisjoint({c["id"] for c in user_board["columns"]})

    assert client.patch(f"/api/cards/{user_card}", json={"title": "hacked"}).status_code == 404
    assert client.delete(f"/api/cards/{user_card}").status_code == 404
    assert client.patch(f"/api/columns/{user_column}", json={"title": "hacked"}).status_code == 404
    assert client.post("/api/cards", json={"column_id": user_column, "title": "x"}).status_code == 404
    assert move(client, user_card, other_board["columns"][0]["id"], 0).status_code == 404
