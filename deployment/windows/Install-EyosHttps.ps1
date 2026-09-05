[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string]$CaddyArchive,
  [Parameter(Mandatory)][string]$WinSWSource,
  [Parameter(Mandatory)][string]$PrivateIp,
  [string]$InstallRoot = 'C:\Program Files\eY-OS'
)
$ErrorActionPreference = 'Stop'
$caddyArtifact = 'caddy_2.11.4_windows_amd64.zip'
$caddySha256 = '1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf'
$caddySha512 = 'cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35'
$winSwSha256 = '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da'

function Assert-FileHash([string]$Path, [string]$Algorithm, [string]$Expected, [string]$Name) {
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Name was not found." }
  $actual = (Get-FileHash -Algorithm $Algorithm -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($actual -cne $Expected) { throw "$Name $Algorithm verification failed." }
}

function Assert-PrivateIpv4([string]$Value) {
  $parsed = $null
  if (!([Net.IPAddress]::TryParse($Value, [ref]$parsed)) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsed.ToString() -cne $Value) {
    throw 'PrivateIp must be an explicit canonical IPv4 address.'
  }
  $bytes = $parsed.GetAddressBytes()
  $private = $bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
  if (!$private) { throw 'PrivateIp must be an RFC1918 private IPv4 address.' }
}

if ([IO.Path]::GetFileName($CaddyArchive) -cne $caddyArtifact) { throw "Caddy archive filename must be exactly $caddyArtifact." }
Assert-PrivateIpv4 $PrivateIp
Assert-FileHash $CaddyArchive 'SHA256' $caddySha256 'Caddy archive'
Assert-FileHash $CaddyArchive 'SHA512' $caddySha512 'Caddy archive'
Assert-FileHash $WinSWSource 'SHA256' $winSwSha256 'WinSW 2.12.0 x64'

if (!$PSCmdlet.ShouldProcess($InstallRoot, 'Install pinned eY OS private HTTPS service')) { return }
$serviceRoot = Join-Path $InstallRoot 'https-service'
$httpsRoot = 'C:\ProgramData\eY-OS\https'
$configRoot = Join-Path $httpsRoot 'config'
$dataRoot = Join-Path $httpsRoot 'data'
$logsRoot = Join-Path $httpsRoot 'logs'
$workRoot = Join-Path $httpsRoot ('.install-' + [Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force $serviceRoot, $configRoot, $dataRoot, $logsRoot, $workRoot | Out-Null

icacls $httpsRoot /inheritance:r | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to remove inherited permissions from HTTPS state.' }
icacls $httpsRoot /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant the restricted HTTPS state ACL.' }

try {
  Expand-Archive -LiteralPath $CaddyArchive -DestinationPath $workRoot
  $verifiedCaddy = Join-Path $workRoot 'caddy.exe'
  if (!(Test-Path -LiteralPath $verifiedCaddy -PathType Leaf)) { throw 'Verified Caddy archive does not contain root caddy.exe.' }
  $version = (& $verifiedCaddy version).Trim()
  if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v2\.11\.4(?:\s|$)') { throw 'Extracted Caddy executable is not v2.11.4.' }

  $caddyfile = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'https\Caddyfile.template')).Replace('__EYOS_PRIVATE_IPV4__', $PrivateIp)
  $renderedCaddyfile = Join-Path $configRoot 'Caddyfile'
  [IO.File]::WriteAllText($renderedCaddyfile, $caddyfile, [Text.UTF8Encoding]::new($false))
  $env:XDG_DATA_HOME = $dataRoot
  $env:XDG_CONFIG_HOME = $configRoot
  & $verifiedCaddy validate --config $renderedCaddyfile --adapter caddyfile
  if ($LASTEXITCODE -ne 0) { throw 'Rendered Caddy configuration validation failed.' }

  Copy-Item -LiteralPath $verifiedCaddy -Destination (Join-Path $serviceRoot 'caddy.exe')
  Copy-Item -LiteralPath $WinSWSource -Destination (Join-Path $serviceRoot 'eyos-https-service.exe')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'https\eyos-https.xml.template') -Destination (Join-Path $serviceRoot 'eyos-https-service.xml')
  & (Join-Path $serviceRoot 'eyos-https-service.exe') install
  if ($LASTEXITCODE -ne 0) { throw 'WinSW HTTPS service installation failed.' }
  sc.exe config eyos-https-service start= delayed-auto | Out-Null
  & (Join-Path $serviceRoot 'eyos-https-service.exe') start
  if ($LASTEXITCODE -ne 0) { throw 'WinSW HTTPS service start failed.' }
  Write-Host 'eY OS private HTTPS service installed. Trust only the exported public root certificate on intended household devices.'
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $workRoot
}
