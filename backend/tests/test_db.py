from app import db


def count(conn, table: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_init_creates_database_and_seeds_demo_board(db_file):
    assert not db_file.exists()
    db.init_db()
    assert db_file.exists()
    with db.connect() as conn:
        assert [r["username"] for r in conn.execute("SELECT username FROM users")] == ["user"]
        titles = [r["title"] for r in conn.execute("SELECT title FROM columns ORDER BY position")]
        assert titles == db.DEFAULT_COLUMNS
        assert count(conn, "cards") == len(db.DEMO_CARDS)


def test_init_does_not_seed_twice(db_file):
    db.init_db()
    with db.connect() as conn:
        conn.execute("DELETE FROM cards")
    db.init_db()
    with db.connect() as conn:
        assert count(conn, "users") == 1
        assert count(conn, "cards") == 0


def test_seeded_positions_are_contiguous(db_file):
    db.init_db()
    with db.connect() as conn:
        for (column_id,) in conn.execute("SELECT id FROM columns").fetchall():
            rows = conn.execute(
                "SELECT position FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
            ).fetchall()
            assert [r[0] for r in rows] == list(range(len(rows)))


def test_password_hashing():
    stored = db.hash_password("password")
    assert "password" not in stored
    assert stored.startswith("scrypt$")
    assert db.verify_password("password", stored)
    assert not db.verify_password("wrong", stored)
    assert db.hash_password("password") != stored  # random salt


def test_deleting_user_cascades(db_file):
    db.init_db()
    with db.connect() as conn:
        conn.execute("DELETE FROM users")
    with db.connect() as conn:
        for table in ("boards", "columns", "cards"):
            assert count(conn, table) == 0


def test_failed_transaction_rolls_back(db_file):
    db.init_db()
    try:
        with db.connect() as conn:
            conn.execute("DELETE FROM cards")
            raise RuntimeError("boom")
    except RuntimeError:
        pass
    with db.connect() as conn:
        assert count(conn, "cards") == len(db.DEMO_CARDS)
