import sqlite3

import pytest

from app import db


def signup(client, username, password="secret123"):
    client.post("/api/auth/logout")
    assert client.post("/api/auth/signup", json={"username": username, "password": password}).status_code == 201


def login(client, username, password="secret123"):
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"username": username, "password": password}).status_code == 200


def boards(client) -> list[dict]:
    return client.get("/api/boards").json()


def board(client, board_id) -> dict:
    response = client.get(f"/api/boards/{board_id}")
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def shared(client):
    """`owner` (alice) shares her board with `member` (bob); carol is not on it. Signed in as alice."""
    signup(client, "carol")
    signup(client, "bob")
    signup(client, "alice")
    board_id = boards(client)[0]["id"]
    assert client.post(f"/api/boards/{board_id}/members", json={"username": "Bob"}).status_code == 201
    return board_id


# --- boards ---


def test_first_board_and_listing(auth_client):
    listed = boards(auth_client)
    assert listed == [{"id": listed[0]["id"], "title": "تخته پروژه", "role": "owner", "owner": "user",
                       "members": 1, "cards": 10, "my_cards": 0}]
    b = board(auth_client, listed[0]["id"])
    assert (b["title"], b["role"]) == ("تخته پروژه", "owner")
    assert b["members"] == [{"username": "user", "role": "owner", "avatar": 0}]


def test_create_rename_and_delete_boards(auth_client):
    created = auth_client.post("/api/boards", json={"title": "  بازاریابی  "})
    assert created.status_code == 201
    new = created.json()
    assert (new["title"], new["role"]) == ("بازاریابی", "owner")
    b = board(auth_client, new["id"])
    assert [c["title"] for c in b["columns"]] == db.DEFAULT_COLUMNS
    assert b["cards"] == {} and len(b["labels"]) == len(db.LABEL_COLORS)
    assert len(boards(auth_client)) == 2

    assert auth_client.patch(f"/api/boards/{new['id']}", json={"title": "فروش"}).status_code == 200
    assert board(auth_client, new["id"])["title"] == "فروش"

    assert auth_client.delete(f"/api/boards/{new['id']}").status_code == 200
    assert auth_client.get(f"/api/boards/{new['id']}").status_code == 404
    assert len(boards(auth_client)) == 1


@pytest.mark.parametrize("title", ["", "   ", "x" * 101])
def test_board_title_validation(auth_client, title):
    assert auth_client.post("/api/boards", json={"title": title}).status_code == 422


def test_boards_of_others_are_invisible(client, shared):
    login(client, "carol")
    assert [b["id"] for b in boards(client)] != [shared]
    assert client.get(f"/api/boards/{shared}").status_code == 404
    assert client.get("/api/boards/board-abc").status_code == 404


def test_cards_and_labels_stay_on_their_own_board(auth_client):
    first = boards(auth_client)[0]["id"]
    second = auth_client.post("/api/boards", json={"title": "دوم"}).json()["id"]
    card_id = board(auth_client, first)["columns"][0]["cardIds"][0]
    other_column = board(auth_client, second)["columns"][0]["id"]
    other_label = board(auth_client, second)["labels"][0]["id"]

    assert auth_client.post(f"/api/cards/{card_id}/move", json={"column_id": other_column, "index": 0}).status_code == 404
    assert auth_client.patch(f"/api/cards/{card_id}", json={"labels": [other_label]}).status_code == 404
    assert card_id in board(auth_client, first)["cards"]


# --- members ---


def test_member_sees_and_edits_a_shared_board(client, shared):
    b = board(client, shared)
    assert b["members"] == [{"username": "alice", "role": "owner", "avatar": 0}, {"username": "bob", "role": "member", "avatar": 0}]

    login(client, "bob")
    listed = {x["id"]: x for x in boards(client)}
    assert listed[shared]["role"] == "member" and listed[shared]["owner"] == "alice"
    column = board(client, shared)["columns"][0]["id"]
    created = client.post("/api/cards", json={"column_id": column, "title": "از طرف باب"})
    assert created.status_code == 201
    client.post(f"/api/boards/{shared}/labels", json={"name": "باب", "color": "blue"})

    login(client, "alice")
    b = board(client, shared)
    assert created.json()["id"] in b["cards"]
    assert any(label["name"] == "باب" for label in b["labels"])


def test_only_the_owner_manages_the_board(client, shared):
    login(client, "bob")
    assert client.patch(f"/api/boards/{shared}", json={"title": "x"}).status_code == 403
    assert client.delete(f"/api/boards/{shared}").status_code == 403
    assert client.post(f"/api/boards/{shared}/members", json={"username": "carol"}).status_code == 403
    assert client.delete(f"/api/boards/{shared}/members/alice").status_code == 403


def test_adding_members_errors(client, shared):
    assert client.post(f"/api/boards/{shared}/members", json={"username": "nobody"}).status_code == 404
    assert client.post(f"/api/boards/{shared}/members", json={"username": "bob"}).status_code == 409
    assert client.post(f"/api/boards/{shared}/members", json={"username": "alice"}).status_code == 409


def test_member_can_leave_and_owner_cannot(client, shared):
    assert client.delete(f"/api/boards/{shared}/members/alice").status_code == 403
    login(client, "bob")
    assert client.delete(f"/api/boards/{shared}/members/bob").status_code == 200
    assert client.get(f"/api/boards/{shared}").status_code == 404


def test_owner_removes_a_member(client, shared):
    assert client.delete(f"/api/boards/{shared}/members/BOB").status_code == 200
    assert [m["username"] for m in board(client, shared)["members"]] == ["alice"]
    assert client.delete(f"/api/boards/{shared}/members/bob").status_code == 404


def test_deleting_a_board_removes_it_for_members(client, shared):
    client.delete(f"/api/boards/{shared}")
    login(client, "bob")
    assert shared not in [b["id"] for b in boards(client)]


# --- assignee ---


def test_assignee_must_be_a_board_member(client, shared):
    card_column = board(client, shared)["columns"][0]["id"]
    card_id = client.post("/api/cards", json={"column_id": card_column, "title": "کار"}).json()["id"]

    assert client.patch(f"/api/cards/{card_id}", json={"assignee": "BOB"}).json()["assignee"] == "bob"
    assert client.patch(f"/api/cards/{card_id}", json={"assignee": "carol"}).status_code == 404
    assert client.patch(f"/api/cards/{card_id}", json={"assignee": None}).json()["assignee"] is None


def test_removing_a_member_clears_their_cards(client, shared):
    column = board(client, shared)["columns"][0]["id"]
    card_id = client.post("/api/cards", json={"column_id": column, "title": "کار", "assignee": "bob"}).json()["id"]
    client.delete(f"/api/boards/{shared}/members/bob")
    assert board(client, shared)["cards"][card_id]["assignee"] is None


# --- migration ---


def test_one_board_per_user_schema_is_upgraded(db_file):
    """The previous version had boards.user_id UNIQUE and free-text cards.assignee."""
    db_file.parent.mkdir(parents=True)
    conn = sqlite3.connect(db_file)
    conn.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
        CREATE TABLE boards (id INTEGER PRIMARY KEY,
                             user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                             title TEXT NOT NULL);
        CREATE TABLE columns (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                              title TEXT NOT NULL, position INTEGER NOT NULL);
        CREATE TABLE cards (id INTEGER PRIMARY KEY,
                            column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
                            title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL,
                            due_date TEXT, priority TEXT, assignee TEXT);
        CREATE TABLE labels (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                             name TEXT NOT NULL DEFAULT '', color TEXT NOT NULL);
        INSERT INTO users VALUES (1, 'old', 'x');
        INSERT INTO boards VALUES (1, 1, 'برد قدیمی');
        INSERT INTO columns VALUES (1, 1, 'ستون', 0);
        INSERT INTO labels VALUES (1, 1, 'نگه دار', 'red');
        INSERT INTO cards (id, column_id, title, position, assignee) VALUES (1, 1, 'mine', 0, ' OLD ');
        INSERT INTO cards (id, column_id, title, position, assignee) VALUES (2, 1, 'stranger', 1, 'سارا');
        """
    )
    conn.close()

    db.init_db()
    db.init_db()  # running again changes nothing

    with db.connect() as conn:
        assert "user_id" not in {r["name"] for r in conn.execute("PRAGMA table_info(boards)")}
        assert "assignee" not in {r["name"] for r in conn.execute("PRAGMA table_info(cards)")}
        # Nothing was lost to cascades while the table was rebuilt.
        assert [tuple(r) for r in conn.execute("SELECT title, owner_id FROM boards")] == [("برد قدیمی", 1)]
        assert conn.execute("SELECT COUNT(*) FROM columns").fetchone()[0] == 1
        assert [tuple(r) for r in conn.execute("SELECT name FROM labels")] == [("نگه دار",)]
        assert [tuple(r) for r in conn.execute("SELECT board_id, user_id, role FROM board_members")] == [(1, 1, "owner")]
        assert [tuple(r) for r in conn.execute("SELECT id, assignee_id FROM cards ORDER BY id")] == [(1, 1), (2, None)]
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert [tuple(r) for r in conn.execute("PRAGMA foreign_key_check")] == []
        # A second board for the same user is now allowed.
        db.create_board(conn, 1, "دومی")
