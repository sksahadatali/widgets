[CmdletBinding()]
param(
  [ValidateRange(1, 65535)][int]$Port = 3001,
  [ValidateRange(1, 120)][int]$TimeoutSeconds = 30
)
$ErrorActionPreference = 'Stop'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    if ($response.StatusCode -eq 200) { Write-Host 'eY OS health check passed.'; exit 0 }
  } catch { Start-Sleep -Milliseconds 500 }
} while ((Get-Date) -lt $deadline)
throw "eY OS did not become healthy on loopback port $Port."
