[CmdletBinding(SupportsShouldProcess)]
param([string]$InstallRoot = 'C:\Program Files\eY-OS')
$ErrorActionPreference = 'Stop'
$exe = Join-Path $InstallRoot 'service\eyos-service.exe'
if ($PSCmdlet.ShouldProcess('eyos-home-service', 'Stop and uninstall Windows service')) {
  & $exe stop
  & $exe uninstall
  if ($LASTEXITCODE -ne 0) { throw 'WinSW service removal failed.' }
}
