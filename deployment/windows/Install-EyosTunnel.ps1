[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string]$CloudflaredSource,
  [Parameter(Mandatory)][string]$WinSWSource,
  [Parameter(Mandatory)][string]$TunnelTokenFile,
  [string]$InstallRoot = 'C:\Program Files\eY-OS'
)
$ErrorActionPreference = 'Stop'
$cloudflaredArtifact = 'cloudflared-windows-amd64.exe'
$cloudflaredVersion = '2026.9.1'
$cloudflaredSha256 = '2837888cc0f5d58f15b6dc478376de90b4d3ba5241c7947455d1e0a0df429712'
$winSwSha256 = '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da'

function Assert-FileHash([string]$Path, [string]$Expected, [string]$Name) {
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Name was not found." }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "$Name must not be a reparse point." }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($actual -cne $Expected) { throw "$Name SHA256 verification failed." }
}

if ([IO.Path]::GetFileName($CloudflaredSource) -cne $cloudflaredArtifact) {
  throw "cloudflared filename must be exactly $cloudflaredArtifact."
}
Assert-FileHash $CloudflaredSource $cloudflaredSha256 'cloudflared 2026.9.1 Windows AMD64'
Assert-FileHash $WinSWSource $winSwSha256 'WinSW 2.12.0 x64'

if (!(Test-Path -LiteralPath $TunnelTokenFile -PathType Leaf)) { throw 'Tunnel token file was not found.' }
$tokenItem = Get-Item -LiteralPath $TunnelTokenFile -Force
if (($tokenItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Tunnel token file must not be a reparse point.' }
if ($tokenItem.Length -le 0) { throw 'Tunnel token file must not be empty.' }

$versionOutput = (& $CloudflaredSource --version).Trim()
if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '^cloudflared version 2026\.9\.1(?:\s|$)') {
  throw "cloudflared executable is not exactly version $cloudflaredVersion."
}

if (!$PSCmdlet.ShouldProcess($InstallRoot, 'Install pinned eY OS Cloudflare Tunnel service')) { return }
$serviceRoot = Join-Path $InstallRoot 'tunnel-service'
$tunnelRoot = 'C:\ProgramData\eY-OS\tunnel'
$configRoot = Join-Path $tunnelRoot 'config'
$logsRoot = Join-Path $tunnelRoot 'logs'
$installedToken = Join-Path $configRoot 'tunnel-token'
New-Item -ItemType Directory -Force $serviceRoot, $configRoot, $logsRoot | Out-Null

icacls $tunnelRoot /inheritance:r | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to remove inherited permissions from Tunnel state.' }
icacls $tunnelRoot /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant the restricted Tunnel state ACL.' }
icacls $logsRoot /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant the restricted Tunnel log ACL.' }

Copy-Item -LiteralPath $TunnelTokenFile -Destination $installedToken
icacls $installedToken /inheritance:r | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to remove inherited permissions from the installed Tunnel token.' }
icacls $installedToken /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' '*S-1-5-19:R' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant the restricted Tunnel token ACL.' }

Copy-Item -LiteralPath $CloudflaredSource -Destination (Join-Path $serviceRoot 'cloudflared.exe')
Copy-Item -LiteralPath $WinSWSource -Destination (Join-Path $serviceRoot 'eyos-tunnel-service.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tunnel\eyos-tunnel.xml.template') -Destination (Join-Path $serviceRoot 'eyos-tunnel-service.xml')

& (Join-Path $serviceRoot 'eyos-tunnel-service.exe') install
if ($LASTEXITCODE -ne 0) { throw 'WinSW Tunnel service installation failed.' }
sc.exe config eyos-tunnel-service start= delayed-auto | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to configure delayed automatic Tunnel service startup.' }
& (Join-Path $serviceRoot 'eyos-tunnel-service.exe') start
if ($LASTEXITCODE -ne 0) { throw 'WinSW Tunnel service start failed.' }
Write-Host 'eY OS Cloudflare Tunnel service installed. Cloudflare DNS and Access remain separate operator configuration.'
