[CmdletBinding(SupportsShouldProcess)]
param([string]$InstallRoot = 'C:\Program Files\eY-OS')
$ErrorActionPreference = 'Stop'
$exe = Join-Path $InstallRoot 'https-service\eyos-https-service.exe'
if ($PSCmdlet.ShouldProcess('eyos-https-service', 'Stop and uninstall Windows service')) {
  & $exe stop
  & $exe uninstall
  if ($LASTEXITCODE -ne 0) { throw 'WinSW HTTPS service removal failed.' }
  Write-Host 'Service removed. C:\ProgramData\eY-OS\https is intentionally retained, including the private CA.'
}
