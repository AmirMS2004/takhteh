"""Which boards the current request changed. Board writes call `touch`; `live.track_changes` collects them
for the request and tells the boards' open clients once the request has succeeded."""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

_changed: ContextVar[set[int] | None] = ContextVar("changed_boards", default=None)


def collect() -> set[int]:
    """Starts collecting for the current request; returns the set that `touch` fills."""
    changed: set[int] = set()
    _changed.set(changed)
    return changed


def touch(board_id: int) -> None:
    changed = _changed.get()
    if changed is not None:
        changed.add(board_id)


@contextmanager
def quiet() -> Iterator[None]:
    """Writes inside are not announced (e.g. the assistant's dry run, which is rolled back)."""
    token = _changed.set(None)
    try:
        yield
    finally:
        _changed.reset(token)
