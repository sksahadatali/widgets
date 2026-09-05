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
  $nodeRoot = Split-Path -Parent (Get-Command node).Source
  Copy-Item -Recurse $nodeRoot (Join-Path $candidate 'node')
  $nodeVersion = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(?<major>[0-9]+)(?:\.|$)') { throw 'Unable to determine the Node.js major version.' }
  $nodeMajor = [int]$Matches['major']
  $manifest = [ordered]@{schemaVersion=1;commit=$commit;tree=$tree;appMode='household';apiTopology='same-origin';nodeMajor=$nodeMajor;builtAt=(Get-Date).ToUniversalTime().ToString('o')}
  [IO.File]::WriteAllText((Join-Path $candidate 'eyos-release.json'), ($manifest | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
  & (Join-Path $candidate 'node\node.exe') (Join-Path $candidate 'server\dist\scripts\validateProductionRelease.js') --release $candidate
  if ($LASTEXITCODE -ne 0) { throw 'Release validation failed.' }
  Move-Item -LiteralPath $candidate -Destination $target
  Write-Host "Validated immutable release: $target"
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $work
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $candidate
}
