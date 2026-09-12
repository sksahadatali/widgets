[CmdletBinding()]
param(
  [Uri]$RemoteUrl,
  [ValidateRange(1, 120)][int]$TimeoutSeconds = 30
)
$ErrorActionPreference = 'Stop'

$loopback = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5
if ($loopback.StatusCode -ne 200) { throw 'Loopback Home Service health check failed.' }

$service = Get-Service -Name 'eyos-tunnel-service' -ErrorAction Stop
if ($service.Status -ne 'Running') { throw 'eY OS Tunnel service is not running.' }

if ($null -ne $RemoteUrl) {
  if (!$RemoteUrl.IsAbsoluteUri -or $RemoteUrl.Scheme -cne 'https' -or $RemoteUrl.UserInfo -or !$RemoteUrl.IsDefaultPort) {
    throw 'RemoteUrl must be an HTTPS origin without credentials or a custom port.'
  }
  $request = [Net.HttpWebRequest]::Create($RemoteUrl)
  $request.AllowAutoRedirect = $false
  $request.Timeout = $TimeoutSeconds * 1000
  $response = $null
  try {
    try {
      $response = [Net.HttpWebResponse]$request.GetResponse()
    } catch [Net.WebException] {
      if ($null -eq $_.Exception.Response) { throw }
      $response = [Net.HttpWebResponse]$_.Exception.Response
    }
    $status = [int]$response.StatusCode
    $location = $response.Headers['Location']
    $accessIntercepted = ($status -eq 302 -or $status -eq 303 -or $status -eq 307 -or $status -eq 308) -and
      $location -match '^https://[^/]+\.cloudflareaccess\.com/'
    if (!$accessIntercepted -and $status -ne 401 -and $status -ne 403) {
      throw 'Remote endpoint did not demonstrate Cloudflare Access interception.'
    }
  } finally {
    if ($null -ne $response) { $response.Close() }
  }
  Write-Host 'Remote endpoint demonstrated Cloudflare Access interception with normal TLS validation.'
}

Write-Host 'eY OS Tunnel host checks passed.'
