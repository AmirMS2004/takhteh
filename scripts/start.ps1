# Build and start the app container (Windows).
Set-Location (Join-Path $PSScriptRoot "..")

docker build -t pm-kanban .
if ($LASTEXITCODE -ne 0) { exit 1 }
docker rm -f pm-kanban 2>$null | Out-Null
New-Item -ItemType Directory -Force data | Out-Null

$envArgs = @()
if (Test-Path .env) { $envArgs = @("--env-file", ".env") }

docker run -d --name pm-kanban -p 8000:8000 @envArgs -v "${PWD}\data:/app/data" pm-kanban
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Running at http://localhost:8000"
