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

## Offline whole-runtime restore

Stop the WinSW service and wait for its runtime operation lock to disappear
before using HS3B. A retained sibling `.restore-state.json` is authoritative
restore evidence: do not clear it or switch releases; inspect and recover the
transaction explicitly.

Production releases contain compiled restore CLIs and their own Node runtime,
so Home-PC recovery does not depend on `tsx` or development dependencies:

```powershell
& 'C:\Program Files\eY-OS\current\node\node.exe' `
  'C:\Program Files\eY-OS\current\server\dist\scripts\restoreRuntime.js' `
  --root '<absolute-runtime-root>' --backup-root '<absolute-backup-root>' `
  --snapshot '<snapshot-id>' --confirm-restore '<same-snapshot-id>'
```

Read-only inspection uses:

```powershell
& 'C:\Program Files\eY-OS\current\node\node.exe' `
  'C:\Program Files\eY-OS\current\server\dist\scripts\inspectRuntimeRestore.js' `
  --root '<absolute-runtime-root>'
```

Explicit recovery uses the exact recorded operation ID:

```powershell
& 'C:\Program Files\eY-OS\current\node\node.exe' `
  'C:\Program Files\eY-OS\current\server\dist\scripts\recoverRuntimeRestore.js' `
  --root '<absolute-runtime-root>' --backup-root '<absolute-backup-root>' `
  --action '<abort|rollback|complete>' --operation-id '<exact-operation-id>' `
  --confirm-recover
```

The runtime parent must be provisioned separately so newly created sibling
directories inherit the required `LocalService` access. Deployment and restore
scripts never grant or change runtime ACLs automatically.

## Private HTTPS foundation

Android Phase 1A adds a separate Caddy 2.11.4 service in front of the existing
loopback Home Service:

```text
Android / Elo -- HTTPS 443 --> Caddy -- HTTP loopback --> 127.0.0.1:3001
```

Keep `EYOS_BIND_HOST=127.0.0.1` and
`EYOS_TRUSTED_LAN_ACCESS=false`. Caddy proxies the complete origin, so React
and relative `/api` requests remain same-origin. The Home Service port must no
longer be reachable from the LAN.

Acquire `caddy_2.11.4_windows_amd64.zip` separately from the official Caddy
release and WinSW x64 2.12.0 from the official WinSW release. The installer
does not download software or resolve a latest version. It requires the exact
Caddy filename and verifies both published Caddy hashes before extraction:

```text
SHA-256 1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf
SHA-512 cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35
```

Run an elevated Windows PowerShell 5.1 session and supply the Home PC's
explicit RFC1918 address; the scripts never discover or print it:

```powershell
.\Install-EyosHttps.ps1 `
  -CaddyArchive 'C:\Install\caddy_2.11.4_windows_amd64.zip' `
  -WinSWSource 'C:\Install\WinSW-x64.exe' `
  -PrivateIp '<home-pc-private-ipv4>'

.\Test-EyosHttps.ps1 -PrivateIp '<home-pc-private-ipv4>'
```

The HTTPS deployment scripts intentionally target Windows PowerShell 5.1 and
the fixed production state location `C:\ProgramData\eY-OS\https`. There is no
alternate ProgramData-root option: service configuration, PKI, data and logs
must remain at that externally managed location.

The service uses `tls internal`, has the Caddy admin API disabled, disables
automatic HTTP redirects, and listens only at the configured private IPv4
HTTPS origin. Stable binaries live under
`C:\Program Files\eY-OS\https-service`; Caddy configuration, PKI and logs live
under `C:\ProgramData\eY-OS\https`. That external state is deliberately
independent of application releases. Its ACL is restricted to SYSTEM,
Administrators and LOCAL SERVICE. Uninstalling the service preserves it.

Windows Firewall remains a manual administrator responsibility:

- Remove/disable the old inbound TCP 3001 LAN rule.
- Allow inbound TCP 443 only on the Private profile with remote scope
  `LocalSubnet`.
- Do not create a Public-profile rule, disable Windows Firewall, enable router
  port forwarding or UPnP, or expose this service to the internet.
- Verify another LAN device cannot reach `<home-pc-private-ipv4>:3001`.

Export only Caddy's public root certificate to an explicit new `.crt` or `.cer`
file:

```powershell
.\Export-EyosHttpsRoot.ps1 -Destination 'C:\Install\eyos-local-root.crt'
```

Transfer that public certificate to each intended household Android device and
install it manually as a CA certificate, then remove the transfer copy. Never
copy or export Caddy's private key. Android may label a user-installed CA as
network monitoring; verify the fingerprint before trust and remove the CA when
the eY OS installation is retired. No ADB or automated trust-store changes are
part of this phase.
