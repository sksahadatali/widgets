[CmdletBinding(SupportsShouldProcess)]
param([string]$InstallRoot = 'C:\Program Files\eY-OS')
$ErrorActionPreference = 'Stop'
$exe = Join-Path $InstallRoot 'tunnel-service\eyos-tunnel-service.exe'
if ($PSCmdlet.ShouldProcess('eyos-tunnel-service', 'Stop and uninstall Windows service')) {
  & $exe stop
  & $exe uninstall
  if ($LASTEXITCODE -ne 0) { throw 'WinSW Tunnel service removal failed.' }
  Write-Host 'Service removed. C:\ProgramData\eY-OS\tunnel is intentionally retained, including the protected token and logs.'
}
