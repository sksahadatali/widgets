[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Repository,
  [string]$InstallRoot = 'C:\Program Files\eY-OS',
  [string]$StagingRoot = 'C:\ProgramData\eY-OS\staging'
)
$ErrorActionPreference = 'Stop'
if ((git -C $Repository status --porcelain)) { throw 'The source checkout must be clean.' }
$commit = (git -C $Repository rev-parse HEAD).Trim()
$tree = (git -C $Repository rev-parse 'HEAD^{tree}').Trim()
$short = $commit.Substring(0, 12)
$work = Join-Path $StagingRoot ([Guid]::NewGuid().ToString())
$candidate = Join-Path (Join-Path $InstallRoot 'releases') (".staging-$short")
$target = Join-Path (Join-Path $InstallRoot 'releases') $commit
if (Test-Path -LiteralPath $target) { throw 'The immutable release already exists.' }
if (Test-Path -LiteralPath $candidate) { throw 'The release staging directory already exists.' }
New-Item -ItemType Directory -Force $work, $candidate | Out-Null
try {
  git -C $Repository archive $commit -o (Join-Path $work 'source.tar')
  tar -xf (Join-Path $work 'source.tar') -C $work
  npm ci --prefix (Join-Path $work 'app')
  npm ci --prefix (Join-Path $work 'server')
  $env:VITE_EY_MODE = 'household'; $env:VITE_API_BASE_URL = ''
  npm run build:production --prefix $work
  npm prune --omit=dev --prefix (Join-Path $work 'server')
  New-Item -ItemType Directory -Force (Join-Path $candidate 'app'), (Join-Path $candidate 'server') | Out-Null
  Copy-Item -Recurse (Join-Path $work 'app\dist') (Join-Path $candidate 'app\dist')
  Copy-Item -Recurse (Join-Path $work 'server\dist') (Join-Path $candidate 'server\dist')
  Copy-Item -Recurse (Join-Path $work 'server\node_modules') (Join-Path $candidate 'server\node_modules')
  Copy-Item (Join-Path $work 'server\package*.json') (Join-Path $candidate 'server')
  $buildNode = (Get-Command node -ErrorAction Stop).Source
  if (![IO.Path]::IsPathFullyQualified($buildNode)) { throw 'The build-host Node.js executable path is not absolute.' }
  $nodeRoot = Split-Path -Parent $buildNode
  Copy-Item -Recurse $nodeRoot (Join-Path $candidate 'node')
  $bundledNode = Join-Path $candidate 'node\node.exe'
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $buildNode).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $bundledNode).Hash) {
    throw 'The bundled Node.js executable does not match the build-host executable.'
  }
  $nodeVersion = (& $buildNode --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(?<major>[0-9]+)(?:\.|$)') { throw 'Unable to determine the Node.js major version.' }
  $nodeMajor = [int]$Matches['major']
  $manifest = [ordered]@{schemaVersion=1;commit=$commit;tree=$tree;appMode='household';apiTopology='same-origin';nodeMajor=$nodeMajor;builtAt=(Get-Date).ToUniversalTime().ToString('o')}
  [IO.File]::WriteAllText((Join-Path $candidate 'eyos-release.json'), ($manifest | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
  & $buildNode (Join-Path $candidate 'server\dist\scripts\validateProductionRelease.js') --release $candidate
  if ($LASTEXITCODE -ne 0) { throw 'Release validation failed.' }
  $publicationAttempts = 5
  for ($attempt = 1; $attempt -le $publicationAttempts; $attempt++) {
    if (!(Test-Path -LiteralPath $candidate -PathType Container)) { throw 'The validated release candidate no longer exists.' }
    if (Test-Path -LiteralPath $target) { throw 'The immutable release target appeared before publication; refusing to overwrite it.' }
    try {
      Move-Item -LiteralPath $candidate -Destination $target
      break
    } catch {
      if ($attempt -eq $publicationAttempts -or !(Test-Path -LiteralPath $candidate) -or (Test-Path -LiteralPath $target)) {
        throw "Unable to publish the validated release after $attempt attempt(s) without overwriting the immutable target: $($_.Exception.Message)"
      }
      Start-Sleep -Milliseconds (250 * $attempt)
    }
  }
  Write-Host "Validated immutable release: $target"
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $work
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $candidate
}
