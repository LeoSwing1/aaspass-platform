param([Parameter(Mandatory=$true)][string]$DumpFile)
$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "DATABASE_URL is not set" }
if (-not (Test-Path $DumpFile)) { throw "Dump file not found: $DumpFile" }
pg_restore --clean --if-exists --no-owner --no-privileges --dbname=$env:DATABASE_URL $DumpFile
Write-Host "Restore completed."
