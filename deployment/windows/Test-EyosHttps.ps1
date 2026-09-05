[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$PrivateIp,
  [ValidateRange(1, 120)][int]$TimeoutSeconds = 30
)
$ErrorActionPreference = 'Stop'
$loopback = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5
if ($loopback.StatusCode -ne 200) { throw 'Loopback Home Service health check failed.' }

$tcp = New-Object Net.Sockets.TcpClient
try {
  $connect = $tcp.BeginConnect($PrivateIp, 443, $null, $null)
  if (!$connect.AsyncWaitHandle.WaitOne([TimeSpan]::FromSeconds($TimeoutSeconds)) -or !$tcp.Connected) { throw 'TCP 443 is not reachable at the supplied private IPv4 address.' }
  $tcp.EndConnect($connect)
} finally { $tcp.Dispose() }

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "https://$PrivateIp/health" -TimeoutSec $TimeoutSeconds
  if ($response.StatusCode -ne 200) { throw 'HTTPS health check returned an unexpected status.' }
} catch {
  $message = $_.Exception.ToString()
  if ($message -match 'trust|certificate|SSL|TLS|secure channel') {
    throw 'HTTPS reached the service, but this device does not trust the eY OS private root certificate.'
  }
  throw
}
Write-Host 'eY OS private HTTPS health check passed with normal certificate validation.'
