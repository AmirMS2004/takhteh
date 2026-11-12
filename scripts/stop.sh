#!/usr/bin/env bash
# Stop and remove the app container (Mac/Linux).
docker rm -f pm-kanban >/dev/null 2>&1
echo "Stopped"
