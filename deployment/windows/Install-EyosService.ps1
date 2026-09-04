[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string]$WinSWSource,
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$InitialCommit,
  [string]$InstallRoot = 'C:\Program Files\eY-OS',
  [string]$ProgramDataRoot = 'C:\ProgramData\eY-OS',
  [int]$Port = 3001
)
$ErrorActionPreference = 'Stop'
$expected = '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da'
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $WinSWSource).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'WinSW 2.12.0 x64 SHA-256 verification failed.' }
$release = Join-Path (Join-Path $InstallRoot 'releases') $InitialCommit
$node = Join-Path $release 'node\node.exe'
& $node (Join-Path $release 'server\dist\scripts\validateProductionRelease.js') --release $release
if ($LASTEXITCODE -ne 0) { throw 'Initial release validation failed.' }
$serviceEnvironment = Join-Path $ProgramDataRoot 'config\service.env'
if (!(Test-Path -LiteralPath $serviceEnvironment -PathType Leaf)) { throw 'Create the external service environment before installation.' }
if (!$PSCmdlet.ShouldProcess($InstallRoot, 'Install pinned eY OS service wrapper')) { return }
$serviceRoot = Join-Path $InstallRoot 'service'
New-Item -ItemType Directory -Force $serviceRoot, (Join-Path $ProgramDataRoot 'config'), (Join-Path $ProgramDataRoot 'logs') | Out-Null
icacls (Join-Path $ProgramDataRoot 'config') /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
icacls (Join-Path $ProgramDataRoot 'logs') /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
Copy-Item -LiteralPath $WinSWSource -Destination (Join-Path $serviceRoot 'eyos-service.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'eyos-service.xml.template') -Destination (Join-Path $serviceRoot 'eyos-service.xml')
$current = Join-Path $InstallRoot 'current'
if (Test-Path -LiteralPath $current) { throw 'The initial current release already exists; use Switch-EyosRelease.ps1.' }
cmd /c mklink /J "`"$current`"" "`"$release`"" | Out-Null
$state = [ordered]@{schemaVersion=1;current=$InitialCommit;previous=@();updatedAt=(Get-Date).ToUniversalTime().ToString('o')}
[IO.File]::WriteAllText((Join-Path $ProgramDataRoot 'deployment-state.json'), ($state | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
& (Join-Path $serviceRoot 'eyos-service.exe') install
if ($LASTEXITCODE -ne 0) { throw 'WinSW service installation failed.' }
sc.exe config eyos-home-service start= delayed-auto | Out-Null
& (Join-Path $serviceRoot 'eyos-service.exe') start
if ($LASTEXITCODE -ne 0) { throw 'WinSW service start failed.' }
& (Join-Path $PSScriptRoot 'Test-EyosHealth.ps1') -Port $Port
