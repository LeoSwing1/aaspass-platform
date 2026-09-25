param([string]$OutputDir = "./backups")
$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "DATABASE_URL is not set" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $OutputDir "aaspass-$stamp.dump"
pg_dump --format=custom --no-owner --no-privileges --file $out $env:DATABASE_URL
Write-Host "Backup created: $out"
