[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string]$Destination
)
$ErrorActionPreference = 'Stop'
$extension = [IO.Path]::GetExtension($Destination)
if ($extension -cne '.crt' -and $extension -cne '.cer') { throw 'Destination must use the .crt or .cer extension.' }
$source = 'C:\ProgramData\eY-OS\https\data\caddy\pki\authorities\local\root.crt'
if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw 'The Caddy public root certificate is not available.' }
if ((Get-Item -LiteralPath $source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The Caddy public root certificate must not be a reparse point.' }
if (Test-Path -LiteralPath $Destination) { throw 'Destination already exists; refusing to overwrite it.' }
$parent = Split-Path -Parent $Destination
if (!$parent -or !(Test-Path -LiteralPath $parent -PathType Container)) { throw 'Destination parent directory must already exist.' }
if ($PSCmdlet.ShouldProcess($Destination, 'Export Caddy public root certificate')) {
  Copy-Item -LiteralPath $source -Destination $Destination
  Write-Host "Exported public root certificate to $Destination. No private key was exported."
}
