import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { getRuntimeRestoreJournalPath } from '../../server/src/runtime/runtimeRestoreJournal.js';

const root = join(process.cwd(), '..', 'deployment', 'windows');
const read = (name: string) => readFile(join(root, name), 'utf8');

const caddySha256 = '1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf';
const caddySha512 = 'cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35';

describe('Windows home-host deployment contract', () => {
  it('pins WinSW 2.12.0, LocalService, delayed start and bounded restart', async () => {
    const [installer, service] = await Promise.all([
      read('Install-EyosService.ps1'),
      read('eyos-service.xml.template'),
    ]);
    assert.match(installer, /05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da/);
    assert.match(installer, /InitialCommit/);
    assert.match(installer, /validateProductionRelease\.js/);
    assert.match(service, /<user>LocalService<\/user>/);
    assert.match(service, /<delayedAutoStart>true<\/delayedAutoStart>/);
    assert.equal((service.match(/<onfailure/g) ?? []).length, 3);
    assert.match(service, /<onfailure action="none"/);
  });

  it('uses an external private environment and keeps application release history bounded to two previous references', async () => {
    const [service, switching, environment, documentation] = await Promise.all([
      read('eyos-service.xml.template'),
      read('Switch-EyosRelease.ps1'),
      read('service.env.example'),
      read('README.md'),
    ]);
    assert.match(service, /EYOS_SERVICE_ENV_FILE/);
    assert.match(service, /C:\\ProgramData\\eY-OS\\config\\service\.env/);
    assert.match(switching, /Select-Object -First 2/);
    assert.match(environment, /^EYOS_BACKUP_ROOT=/m);
    assert.match(documentation, /operating-system boot identity/);
    assert.match(documentation, /PID absence is never recovery proof/);
    assert.match(documentation, /legacy\s+locks/i);
  });

  it('does not automate firewall or runtime migration, backup, restore, or lock clearing', async () => {
    const names = ['Install-EyosService.ps1', 'New-EyosRelease.ps1', 'Switch-EyosRelease.ps1', 'Uninstall-EyosService.ps1'];
    const content = (await Promise.all(names.map(read))).join('\n');
    assert.doesNotMatch(content, /New-NetFirewallRule|netsh\s+advfirewall/i);
    assert.doesNotMatch(content, /runtime:(?:migrate|backup|restore|operation:clear)/i);
  });

  it('derives integer Node major metadata from node --version without fragile native-process JavaScript quoting', async () => {
    const release = await read('New-EyosRelease.ps1');
    assert.match(release, /\(& \$buildNode --version\)\.Trim\(\)/);
    assert.match(release, /\^v\(\?<major>\[0-9\]\+\)\(\?:\\\.\|\$\)/);
    assert.match(release, /\$nodeMajor = \[int\]\$Matches\['major'\]/);
    assert.match(release, /nodeMajor=\$nodeMajor/);
    assert.doesNotMatch(release, /node\s+-p|process\.versions\.node|split\s*\(/);

    const parsed = /^v(?<major>[0-9]+)(?:\.|$)/.exec('v24.18.0');
    const nodeMajor = Number(parsed?.groups?.major);
    assert.equal(nodeMajor, 24);
    assert.equal(Number.isInteger(nodeMajor), true);
  });

  it('validates with one absolute build-host Node and verifies the bundled executable before publication', async () => {
    const release = await read('New-EyosRelease.ps1');
    assert.match(release, /\$buildNode = \(Get-Command node -ErrorAction Stop\)\.Source/);
    assert.match(release, /\$buildNode -notmatch '\^\(\?:\[A-Za-z\]:\[\\\\\/\]\|\[\\\\\/\]\{2\}/);
    assert.doesNotMatch(release, /IsPathFullyQualified/);
    assert.match(release, /\$nodeRoot = Split-Path -Parent \$buildNode/);
    assert.match(release, /Get-FileHash -Algorithm SHA256 -LiteralPath \$buildNode/);
    assert.match(release, /Get-FileHash -Algorithm SHA256 -LiteralPath \$bundledNode/);
    assert.match(release, /& \$buildNode \(Join-Path \$candidate 'server\\dist\\scripts\\validateProductionRelease\.js'\)/);
    assert.doesNotMatch(release, /& \(Join-Path \$candidate 'node\\node\.exe'\)/);
  });

  it('publishes atomically with bounded retries and refuses staging reuse or target overwrite', async () => {
    const release = await read('New-EyosRelease.ps1');
    assert.match(release, /if \(Test-Path -LiteralPath \$candidate\) \{ throw 'The release staging directory already exists\.' \}/);
    assert.match(release, /\$publicationAttempts = 5/);
    assert.match(release, /for \(\$attempt = 1; \$attempt -le \$publicationAttempts; \$attempt\+\+\)/);
    assert.match(release, /Move-Item -LiteralPath \$candidate -Destination \$target/);
    assert.match(release, /Start-Sleep -Milliseconds \(250 \* \$attempt\)/);
    assert.match(release, /refusing to overwrite it/);
    assert.match(release, /Unable to publish the validated release after \$attempt attempt\(s\)/);
    assert.doesNotMatch(release, /Move-Item[^\n]*-Force|Copy-Item[^\n]*\$candidate[^\n]*\$target/);
  });

  it('refuses release switching for the authoritative HS3B restore-state journal', async () => {
    const switching = await read('Switch-EyosRelease.ps1');
    const authoritativeName = getRuntimeRestoreJournalPath('C:\\synthetic\\runtime')
      .split('\\')
      .at(-1)!;
    assert.equal(authoritativeName, '.runtime.restore-state.json');
    assert.match(switching, /\.restore-state\.json/);
    assert.doesNotMatch(switching, /\.restore-journal\.json/);
    assert.doesNotMatch(switching, /runtime:operation:clear|runtime:restore:recover/);
  });

  it('pins and verifies the exact Caddy 2.11.4 Windows archive before extraction', async () => {
    const installer = await read('Install-EyosHttps.ps1');
    assert.match(installer, /caddy_2\.11\.4_windows_amd64\.zip/);
    assert.match(installer, new RegExp(caddySha256));
    assert.match(installer, new RegExp(caddySha512));
    assert.match(installer, /GetFileName\(\$CaddyArchive\) -cne \$caddyArtifact/);
    const sha256Validation = installer.indexOf("Assert-FileHash $CaddyArchive 'SHA256'");
    const sha512Validation = installer.indexOf("Assert-FileHash $CaddyArchive 'SHA512'");
    const extraction = installer.indexOf('Expand-Archive');
    assert.notEqual(sha256Validation, -1);
    assert.notEqual(sha512Validation, -1);
    assert.notEqual(extraction, -1);
    assert.ok(sha256Validation < extraction);
    assert.ok(sha512Validation < extraction);
    assert.doesNotMatch(installer, /Invoke-WebRequest|Start-BitsTransfer|latest/i);
  });

  it('accepts only an explicit RFC1918 IPv4 and validates the rendered configuration', async () => {
    const installer = await read('Install-EyosHttps.ps1');
    assert.match(installer, /AddressFamily\]::InterNetwork/);
    assert.match(installer, /\$bytes\[0\] -eq 10/);
    assert.match(installer, /\$bytes\[0\] -eq 172/);
    assert.match(installer, /\$bytes\[0\] -eq 192/);
    assert.match(installer, /\.Replace\('__EYOS_PRIVATE_IPV4__', \$PrivateIp\)/);
    assert.match(installer, /& \$verifiedCaddy validate --config \$renderedCaddyfile --adapter caddyfile/);
    assert.match(installer, /\$verifiedCaddy = Join-Path \$workRoot 'caddy\.exe'/);
    assert.match(installer, /\$version = \(& \$verifiedCaddy version\)\.Trim\(\)/);
    assert.match(installer, /\^v2\\\.11\\\.4\(\?:\\s\|\$\)/);
    assert.ok(installer.indexOf('& $verifiedCaddy version') < installer.indexOf("'eyos-https-service.exe') install"));
    assert.doesNotMatch(installer, /Get-NetIPAddress|NetworkInterface|Dns\.GetHost/);
  });

  it('uses one private HTTPS origin and a loopback whole-origin proxy', async () => {
    const caddyfile = await read('https/Caddyfile.template');
    assert.match(caddyfile, /admin off/);
    assert.match(caddyfile, /auto_https disable_redirects/);
    assert.match(caddyfile, /https:\/\/__EYOS_PRIVATE_IPV4__/);
    assert.match(caddyfile, /tls internal/);
    assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:3001/);
    assert.doesNotMatch(caddyfile, /header\s+Cache-Control|acme|localhost/);
  });

  it('runs pinned Caddy as an independent delayed LocalService with bounded restart', async () => {
    const [installer, service] = await Promise.all([
      read('Install-EyosHttps.ps1'),
      read('https/eyos-https.xml.template'),
    ]);
    assert.match(installer, /https-service/);
    assert.match(installer, /Caddy.*v2\.11\.4/);
    assert.match(service, /<id>eyos-https-service<\/id>/);
    assert.match(service, /<user>LocalService<\/user>/);
    assert.match(service, /<delayedAutoStart>true<\/delayedAutoStart>/);
    assert.equal((service.match(/<onfailure/g) ?? []).length, 3);
    assert.match(service, /<onfailure action="restart" delay="15 sec"/);
    assert.match(service, /<onfailure action="restart" delay="60 sec"/);
    assert.match(service, /<onfailure action="none"/);
    assert.match(service, /C:\\ProgramData\\eY-OS\\https/);
    assert.doesNotMatch(service, /\\current\\|\\releases\\/);
  });

  it('restricts external HTTPS state and exports only the public root certificate', async () => {
    const [installer, exporter, uninstaller] = await Promise.all([
      read('Install-EyosHttps.ps1'),
      read('Export-EyosHttpsRoot.ps1'),
      read('Uninstall-EyosHttps.ps1'),
    ]);
    assert.match(installer, /icacls \$httpsRoot \/inheritance:r/);
    const removeInheritance = installer.indexOf('icacls $httpsRoot /inheritance:r');
    const inheritanceCheck = installer.indexOf("throw 'Unable to remove inherited permissions from HTTPS state.'");
    const restrictedGrant = installer.indexOf('icacls $httpsRoot /grant:r');
    const grantCheck = installer.indexOf("throw 'Unable to grant the restricted HTTPS state ACL.'");
    assert.ok(removeInheritance < inheritanceCheck);
    assert.ok(inheritanceCheck < restrictedGrant);
    assert.ok(restrictedGrant < grantCheck);
    assert.equal((installer.match(/if \(\$LASTEXITCODE -ne 0\) \{ throw 'Unable to .*HTTPS state/g) ?? []).length, 2);
    assert.match(installer, /S-1-5-18/);
    assert.match(installer, /S-1-5-32-544/);
    assert.match(installer, /S-1-5-19/);
    assert.match(exporter, /authorities\\local\\root\.crt/);
    assert.match(exporter, /\.crt.*\.cer/);
    assert.doesNotMatch(exporter, /root\.key|private_key|pki\\authorities\\local\\private/i);
    assert.doesNotMatch(uninstaller, /Remove-Item|ProgramDataRoot/);
  });

  it('freezes loopback Express and the external HTTPS state contract', async () => {
    const [installer, exporter, serviceEnvironment, documentation] = await Promise.all([
      read('Install-EyosHttps.ps1'),
      read('Export-EyosHttpsRoot.ps1'),
      readFile(join(process.cwd(), '.env.example'), 'utf8'),
      read('README.md'),
    ]);
    assert.match(serviceEnvironment, /^EYOS_BIND_HOST=127\.0\.0\.1$/m);
    assert.match(serviceEnvironment, /^EYOS_TRUSTED_LAN_ACCESS=false$/m);
    assert.match(installer, /\$httpsRoot = 'C:\\ProgramData\\eY-OS\\https'/);
    assert.match(exporter, /\$source = 'C:\\ProgramData\\eY-OS\\https\\data\\caddy\\pki\\authorities\\local\\root\.crt'/);
    assert.doesNotMatch(installer + exporter, /ProgramDataRoot/);
    assert.match(documentation, /Windows PowerShell 5\.1/);
    assert.match(documentation, /fixed production state location `C:\\ProgramData\\eY-OS\\https`/);
  });

  it('documents the manual least-privilege firewall migration', async () => {
    const documentation = await read('README.md');
    assert.match(documentation, /Remove\/disable the old inbound TCP 3001 LAN rule\./);
    assert.match(documentation, /Allow inbound TCP 443 only on the Private profile/);
    assert.match(documentation, /`LocalSubnet`/);
    assert.match(documentation, /Do not create a Public-profile rule/);
  });

  it('tests HTTPS without certificate-validation bypass and never automates firewall or Android trust', async () => {
    const names = [
      'Install-EyosHttps.ps1',
      'Export-EyosHttpsRoot.ps1',
      'Test-EyosHttps.ps1',
      'Uninstall-EyosHttps.ps1',
    ];
    const [testScript, content] = await Promise.all([
      read('Test-EyosHttps.ps1'),
      Promise.all(names.map(read)).then((parts) => parts.join('\n')),
    ]);
    assert.match(testScript, /http:\/\/127\.0\.0\.1:3001\/health/);
    assert.match(testScript, /TcpClient/);
    assert.match(testScript, /https:\/\/\$PrivateIp\/health/);
    assert.doesNotMatch(testScript, /SkipCertificateCheck|ServerCertificateValidationCallback|curl(?:\.exe)?\s+-k/i);
    assert.doesNotMatch(content, /New-NetFirewallRule|netsh\s+advfirewall|adb\s+|certutil\s+-addstore/i);
  });

  it('pins and verifies cloudflared 2026.9.1 and WinSW before Tunnel installation', async () => {
    const installer = await read('Install-EyosTunnel.ps1');
    assert.match(installer, /cloudflared-windows-amd64\.exe/);
    assert.match(installer, /2837888cc0f5d58f15b6dc478376de90b4d3ba5241c7947455d1e0a0df429712/);
    assert.match(installer, /05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da/);
    assert.match(installer, /GetFileName\(\$CloudflaredSource\) -cne \$cloudflaredArtifact/);
    assert.match(installer, /& \$CloudflaredSource --version/);
    assert.match(installer, /\^cloudflared version 2026\\\.9\\\.1/);
    const cloudflaredHash = installer.indexOf("Assert-FileHash $CloudflaredSource");
    const winSwHash = installer.indexOf("Assert-FileHash $WinSWSource");
    const version = installer.indexOf('& $CloudflaredSource --version');
    const install = installer.indexOf("'eyos-tunnel-service.exe') install");
    assert.ok(cloudflaredHash >= 0 && cloudflaredHash < version);
    assert.ok(winSwHash >= 0 && winSwHash < install);
    assert.ok(version >= 0 && version < install);
    assert.doesNotMatch(installer, /Invoke-WebRequest|Start-BitsTransfer|latest/i);
  });

  it('installs a protected external token without putting it in service arguments', async () => {
    const [installer, service] = await Promise.all([
      read('Install-EyosTunnel.ps1'),
      read('tunnel/eyos-tunnel.xml.template'),
    ]);
    assert.match(installer, /\$tunnelRoot = 'C:\\ProgramData\\eY-OS\\tunnel'/);
    assert.match(installer, /icacls \$tunnelRoot \/inheritance:r/);
    assert.match(installer, /icacls \$logsRoot \/grant:r[^\n]*S-1-5-19:\(OI\)\(CI\)M/);
    assert.match(installer, /Unable to grant the restricted Tunnel log ACL/);
    assert.match(installer, /icacls \$installedToken \/inheritance:r/);
    assert.match(installer, /S-1-5-18:F/);
    assert.match(installer, /S-1-5-32-544:F/);
    assert.match(installer, /S-1-5-19:R/);
    assert.match(service, /--token-file "C:\\ProgramData\\eY-OS\\tunnel\\config\\tunnel-token"/);
    assert.doesNotMatch(service, /--token(?:\s|=)(?!-file)/);
    assert.doesNotMatch(service, /ey\.|ayanoh|example\.com|@/i);
  });

  it('runs cloudflared independently as delayed LocalService with bounded restart and no auto-update', async () => {
    const service = await read('tunnel/eyos-tunnel.xml.template');
    assert.match(service, /<id>eyos-tunnel-service<\/id>/);
    assert.match(service, /<user>LocalService<\/user>/);
    assert.match(service, /<delayedAutoStart>true<\/delayedAutoStart>/);
    assert.equal((service.match(/<onfailure/g) ?? []).length, 3);
    assert.match(service, /<onfailure action="restart" delay="15 sec"/);
    assert.match(service, /<onfailure action="restart" delay="60 sec"/);
    assert.match(service, /<onfailure action="none"/);
    assert.match(service, /tunnel --no-autoupdate run --token-file/);
    assert.match(service, /C:\\ProgramData\\eY-OS\\tunnel/);
    assert.doesNotMatch(service, /\\current\\|\\releases\\|<download|<downloadfrom|<downloadto/i);
  });

  it('keeps the remote origin at loopback Express and documents Cloudflare configuration as external', async () => {
    const documentation = await read('README.md');
    assert.match(documentation, /http:\/\/127\.0\.0\.1:3001/);
    assert.match(documentation, /do not route the tunnel through Caddy/i);
    assert.match(documentation, /does not configure a Cloudflare tunnel, DNS hostname, Access application or\s+identity policy/i);
    assert.match(documentation, /entire hostname, including `\/api\/\*` and `\/health`/);
    assert.match(documentation, /bypass Cloudflare caching for the whole private\s+application origin/i);
    assert.doesNotMatch(documentation, /ey\.ayanoh\.com|@[A-Za-z0-9.-]+/i);
  });

  it('tests only host-observable Tunnel and Access interception state with normal TLS validation', async () => {
    const tester = await read('Test-EyosTunnel.ps1');
    assert.match(tester, /http:\/\/127\.0\.0\.1:3001\/health/);
    assert.match(tester, /Get-Service -Name 'eyos-tunnel-service'/);
    assert.match(tester, /Scheme -cne 'https'/);
    assert.match(tester, /AllowAutoRedirect = \$false/);
    assert.match(tester, /cloudflareaccess\\\.com/);
    assert.doesNotMatch(tester, /SkipCertificateCheck|ServerCertificateValidationCallback|curl(?:\.exe)?\s+-k/i);
    assert.doesNotMatch(tester, /approved|allowlisted|identity passed/i);
  });

  it('does not automate inbound firewall, DNS, Access, Android trust, or production configuration', async () => {
    const names = ['Install-EyosTunnel.ps1', 'Test-EyosTunnel.ps1', 'Uninstall-EyosTunnel.ps1'];
    const content = (await Promise.all(names.map(read))).join('\n');
    assert.doesNotMatch(content, /New-NetFirewallRule|netsh\s+advfirewall|route(?:r)?\s+forward|UPnP|DMZ/i);
    assert.doesNotMatch(content, /adb\s+|certutil\s+-addstore/i);
    assert.doesNotMatch(content, /cloudflare.*(?:api|dns|access).*token|api\.cloudflare\.com/i);
    assert.doesNotMatch(content, /ey\.ayanoh\.com|@[A-Za-z0-9.-]+/i);
  });

  it('retains protected Tunnel state on uninstall', async () => {
    const uninstaller = await read('Uninstall-EyosTunnel.ps1');
    assert.match(uninstaller, /eyos-tunnel-service/);
    assert.match(uninstaller, /intentionally retained/);
    assert.doesNotMatch(uninstaller, /Remove-Item|Clear-Content|Set-Content/);
  });
});
