# Stop and remove the app container (Windows).
docker rm -f pm-kanban 2>$null | Out-Null
Write-Host "Stopped"
