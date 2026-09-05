import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { getRuntimeRestoreJournalPath } from '../../server/src/runtime/runtimeRestoreJournal.js';

const root = join(process.cwd(), '..', 'deployment', 'windows');
const read = (name: string) => readFile(join(root, name), 'utf8');

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
    const [service, switching] = await Promise.all([
      read('eyos-service.xml.template'),
      read('Switch-EyosRelease.ps1'),
    ]);
    assert.match(service, /EYOS_SERVICE_ENV_FILE/);
    assert.match(service, /C:\\ProgramData\\eY-OS\\config\\service\.env/);
    assert.match(switching, /Select-Object -First 2/);
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
});
