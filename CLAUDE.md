# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The root `AGENTS.md` (imported above, in Persian) holds the product requirements, constraints, brand colors and coding standards. Each part of the codebase has its own detailed `AGENTS.md` that is **not** loaded automatically; read the relevant one before changing code there:

- `backend/AGENTS.md` - every module, route, error code and AI operation
- `frontend/AGENTS.md` - every component/lib file, i18n rules, test setup and testing gotchas
- `scripts/AGENTS.md` - start/stop scripts

Also check `docs/PLAN.md` (phase-by-phase plan and history; new work is appended as a new section), `docs/DATABASE.md` (schema) and `docs/BRAND.md` (name "تخته", voice, colors) before starting. These docs describe the code at file level, so update them alongside code changes.

## Commands

Run the app (Docker, port 8000, data persisted in `./data/`): `./scripts/start.sh` / `.\scripts\start.ps1`, stop with `stop.sh` / `stop.ps1`. Demo login `user` / `password`.

Backend (`backend/`, Python 3.13, `uv`):
- `uv run pytest` - all tests (live AI tests excluded by default via `addopts = "-m 'not live'"`)
- `uv run pytest tests/test_board.py::test_name` - single test
- `uv run pytest -m live` - tests that call the real AI provider (needs `.env`)
- Without local `uv`, run inside the uv image (from repo root):
  `docker run --rm -v "$PWD/backend:/src" -w /src -e UV_PROJECT_ENVIRONMENT=/tmp/venv ghcr.io/astral-sh/uv:python3.13-bookworm-slim uv run pytest -q`
- Run `uv lock` after changing dependencies.

Frontend (`frontend/`, Next.js 16 / React 19 / Tailwind 4):
- `npm run lint`, `npm test` (Vitest + jsdom), `npm run build` (static export to `out/`; also the type check CI relies on)
- `npx vitest run src/components/Board.test.tsx` / `-t "name"` - single file or test
- `npm run test:e2e` - Playwright; global setup builds the Docker image and runs a throwaway container `pm-kanban-e2e` on port 8001 (Docker must be running). Single spec: `npx playwright test e2e/board.spec.ts`
- `npm run dev` - proxies `/api` to the container on port 8000

CI (`.github/workflows/ci.yml`) runs backend pytest, frontend lint/test/build, and e2e on every push.

## Architecture

Single Docker image: a Node stage builds the Next.js static export (`output: "export"`), which is copied into the Python image as `backend/static/` and served by FastAPI at `/` after all `/api/*` routes. There is no Node server at runtime; without `static/`, local `/` returns 404.

Backend layering:
- `db.py` - raw `sqlite3` (no ORM), schema creation, in-place migrations (`_migrate`) and seeding on startup. DB path `data/app.db` or `DB_PATH`.
- `board_service.py` - the single place for all board reads/writes and access control (board membership: non-member -> 404, owner-only -> 403). Every write also logs activity (`activity.py`), creates notifications (`notifications.py`) and marks the board changed (`changes.py`). Route modules (`board.py`, `auth.py`, ...) are thin wrappers over it.
- AI (`ai.py`, `ai_routes.py`) - OpenAI-compatible client to Groq or OpenRouter, strict structured output `{reply, operations}`. Operations are executed by `Applier` through `board_service` inside a transaction that is **rolled back** (dry run, notifications/live events suppressed via `changes.quiet`); valid ones are stored as a pending proposal on the chat message. Apply/reject/undo endpoints act on that proposal; undo restores a full board snapshot. Any new user-facing board capability normally needs a matching AI operation, a `describe`/`describe_item` entry and frontend `describeChange` text.
- Live sync (`live.py`) - in-process WebSocket per board and per user (relies on a single uvicorn process); broadcast happens after a successful request, tagged with the caller's `X-Client-Id` so the originating tab ignores it.
- API ids are prefixed strings (`board-N`, `col-N`, `card-N`, `label-N`, `msg-N`, `act-N`).

Frontend:
- `src/app/page.tsx` handles auth state and switches between login, `BoardsArea` (board + chat sidebar) and `Dashboard`.
- `src/lib/useBoard.ts` is the board store shared by board and chat: optimistic updates, `persist` reloads from server on failure, remote changes are held while dragging.
- `src/lib/api.ts` wraps all fetches; `src/test/fakeApi.ts` is an in-memory backend (fetch + WebSocket) used by all Vitest tests, so API changes must be mirrored there.
- All UI text comes from `t()` in `src/lib/i18n.ts` (Persian default/RTL, English/LTR); use logical direction classes (`ms-`, `pe-`, `start-`...) and `dir="auto"` on user content. Colors come from tokens in `globals.css` (`text-ink`, `bg-surface`), not raw Tailwind colors.
- Next.js 16 differs from older versions: consult `frontend/node_modules/next/dist/docs/` before using Next APIs. `cacheComponents` / `partialPrefetching` break static export.

## Conventions

- Keep it simple; no emojis anywhere (code, docs, commits).
- In UI copy the board is called "تخته", not "برد".
