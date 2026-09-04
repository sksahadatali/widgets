# Windows home-host deployment

HS4B runs one validated eY OS release under WinSW 2.12.0 as `LocalService`.
Application releases live under `C:\Program Files\eY-OS`; the external service
environment, logs and deployment state live under `C:\ProgramData\eY-OS`.
`EYOS_RUNTIME_DIR` remains an independently managed external runtime and is
never copied, moved, initialized or rolled back by these scripts.

The deployment flow is: build an immutable Household release from a clean Git
commit, validate it, stop the service, switch the `current` junction, start,
and verify loopback `/health`. `deployment-state.json` records the current and
two previous validated releases. This is a fixed three-release policy, not a
general pruning or update system; removal of unreferenced older application
directories remains an explicit administrator action.

Download `WinSW-x64.exe` v2.12.0 from the official WinSW release. The installer
accepts it only when SHA-256 is
`05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da`.
Create and validate a release first. Copy `service.env.example` to
`C:\ProgramData\eY-OS\config\service.env`, set the
existing runtime path and secrets, and restrict the file ACL to Administrators,
SYSTEM and LOCAL SERVICE. Never put that file in Git or a release directory.
Then run `Install-EyosService.ps1` with that release's full commit as
`-InitialCommit`; installation refuses an unvalidated first release and ends
with a loopback health check. Later upgrades and application-only rollbacks use
`Switch-EyosRelease.ps1`.

Windows Firewall configuration is manual: Private profile, TCP 3001,
`LocalSubnet` remote scope only. Do not enable a Public-profile rule, router
port forwarding or UPnP. Use a router DHCP reservation for the host address.

Stale runtime operation locks remain fail-closed. Never delete one as part of
deployment; inspect and clear it only through the explicit runtime operation
workflow after proving its owner is no longer running.
