#!/usr/bin/env bash
# Build and start the app container (Mac/Linux).
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash on Windows rewrites "/app/data"-style arguments; keep the volume path as written.
export MSYS_NO_PATHCONV=1

docker build -t pm-kanban .
docker rm -f pm-kanban >/dev/null 2>&1 || true
mkdir -p data

env_args=()
if [ -f .env ]; then env_args=(--env-file .env); fi

docker run -d --name pm-kanban -p 8000:8000 ${env_args[@]+"${env_args[@]}"} -v "$PWD/data:/app/data" pm-kanban
echo "Running at http://localhost:8000"
