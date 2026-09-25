$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "Starting AasPass local infrastructure..." -ForegroundColor Green
docker compose -f database/docker-compose.yml up -d
Write-Host "PostgreSQL: localhost:5432/aaspass" -ForegroundColor Cyan
Write-Host "Redis:      localhost:6379" -ForegroundColor Cyan
