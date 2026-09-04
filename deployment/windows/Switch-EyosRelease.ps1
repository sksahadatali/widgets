[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit,
  [string]$InstallRoot = 'C:\Program Files\eY-OS',
  [string]$ProgramDataRoot = 'C:\ProgramData\eY-OS',
  [int]$Port = 3001
)
$ErrorActionPreference = 'Stop'
$release = Join-Path (Join-Path $InstallRoot 'releases') $Commit
$node = Join-Path $release 'node\node.exe'
& $node (Join-Path $release 'server\dist\scripts\validateProductionRelease.js') --release $release
if ($LASTEXITCODE -ne 0) { throw 'Target release validation failed.' }
if (!$PSCmdlet.ShouldProcess($Commit, 'Stop service and switch validated application release')) { return }
$service = Join-Path $InstallRoot 'service\eyos-service.exe'
& $service stop
if ($LASTEXITCODE -ne 0) { throw 'Service stop failed. Resolve the runtime operation lock explicitly; it is never cleared automatically.' }
$serviceEnvironment = Join-Path $ProgramDataRoot 'config\service.env'
$runtimeLine = Get-Content -LiteralPath $serviceEnvironment | Where-Object { $_ -match '^\s*EYOS_RUNTIME_DIR\s*=' } | Select-Object -Last 1
if (!$runtimeLine) { throw 'The external service environment does not define EYOS_RUNTIME_DIR.' }
$runtimeRoot = ($runtimeLine -replace '^\s*EYOS_RUNTIME_DIR\s*=\s*', '').Trim().Trim('"').Trim("'")
$runtimeLeaf = Split-Path -Leaf $runtimeRoot.TrimEnd('\')
$runtimeParent = Split-Path -Parent $runtimeRoot.TrimEnd('\')
$operationLock = Join-Path $runtimeParent (".$runtimeLeaf.operation-lock")
$restoreJournal = Join-Path $runtimeParent (".$runtimeLeaf.restore-journal.json")
if ((Test-Path -LiteralPath $operationLock) -or (Test-Path -LiteralPath $restoreJournal)) {
  throw 'Runtime operation or restore evidence remains after controlled stop. Deployment refuses; resolve it explicitly.'
}
$current = Join-Path $InstallRoot 'current'
$statePath = Join-Path $ProgramDataRoot 'deployment-state.json'
$stateJson = if (Test-Path $statePath) { Get-Content -Raw $statePath } else { $null }
$state = if ($stateJson) { $stateJson | ConvertFrom-Json } else { [pscustomobject]@{schemaVersion=1;current=$null;previous=@()} }
$oldCommit = $state.current
$previous = @($state.current) + @($state.previous) | Where-Object { $_ -and $_ -ne $Commit } | Select-Object -First 2
$next = Join-Path $InstallRoot '.current-next'
if (Test-Path $next) { throw 'A pending current junction already exists.' }
cmd /c mklink /J "`"$next`"" "`"$release`"" | Out-Null
if (Test-Path $current) { Remove-Item $current }
Move-Item $next $current
$newState = [ordered]@{schemaVersion=1;current=$Commit;previous=@($previous);updatedAt=(Get-Date).ToUniversalTime().ToString('o')}
[IO.File]::WriteAllText($statePath, ($newState | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
& $service start
try {
  & (Join-Path $PSScriptRoot 'Test-EyosHealth.ps1') -Port $Port
} catch {
  if ($oldCommit) {
    & $service stop
    $oldRelease = Join-Path (Join-Path $InstallRoot 'releases') $oldCommit
    Remove-Item $current
    cmd /c mklink /J "`"$next`"" "`"$oldRelease`"" | Out-Null
    Move-Item $next $current
    [IO.File]::WriteAllText($statePath, $stateJson, [Text.UTF8Encoding]::new($false))
    & $service start
    & (Join-Path $PSScriptRoot 'Test-EyosHealth.ps1') -Port $Port
  }
  throw 'New release failed health validation; the previous application release was restored when available.'
}
Write-Host "Active release: $Commit. Previous validated releases retained: $($previous -join ', ')."
