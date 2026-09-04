import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { validateProductionRelease } from '../../server/src/deployment/productionRelease.js';

const roots: string[] = [];
async function release(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'eyos-release-'));
  roots.push(root);
  await Promise.all([
    mkdir(join(root, 'app', 'dist'), { recursive: true }),
    mkdir(join(root, 'server', 'dist'), { recursive: true }),
    mkdir(join(root, 'server', 'dist', 'scripts'), { recursive: true }),
    mkdir(join(root, 'server', 'node_modules'), { recursive: true }),
    mkdir(join(root, 'node'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, 'app', 'dist', 'index.html'), '<script src="/assets/app.js"></script>'),
    writeFile(join(root, 'app', 'dist', 'eyos-build.json'), JSON.stringify({ schemaVersion: 1, appMode: 'household' })),
    writeFile(join(root, 'server', 'dist', 'server.js'), '/* synthetic */'),
    writeFile(join(root, 'server', 'dist', 'scripts', 'restoreRuntime.js'), '/* synthetic */'),
    writeFile(join(root, 'server', 'dist', 'scripts', 'inspectRuntimeRestore.js'), '/* synthetic */'),
    writeFile(join(root, 'server', 'dist', 'scripts', 'recoverRuntimeRestore.js'), '/* synthetic */'),
    writeFile(join(root, 'server', 'package.json'), '{"type":"module"}'),
    writeFile(join(root, 'node', process.platform === 'win32' ? 'node.exe' : 'node'), 'synthetic'),
  ]);
  const manifestPath = join(root, 'eyos-release.json');
  await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, commit: 'a'.repeat(40), tree: 'b'.repeat(40), appMode: 'household', apiTopology: 'same-origin', nodeMajor: Number(process.versions.node.split('.')[0]), builtAt: '2026-09-04T00:00:00.000Z' }));
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe('validated production releases', () => {
  it('accepts the minimal immutable Household same-origin artifact', async () => {
    const root = await release();
    assert.equal((await validateProductionRelease(root)).commit, 'a'.repeat(40));
  });

  it('rejects Demo metadata and loopback API contamination', async () => {
    const root = await release();
    await writeFile(join(root, 'app', 'dist', 'eyos-build.json'), '{"schemaVersion":1,"appMode":"demo"}');
    await assert.rejects(() => validateProductionRelease(root), /Household/);
    await writeFile(join(root, 'app', 'dist', 'eyos-build.json'), '{"schemaVersion":1,"appMode":"household"}');
    await writeFile(join(root, 'app', 'dist', 'app.js'), 'fetch("http://localhost:3001/api/lists")');
    await assert.rejects(() => validateProductionRelease(root), /loopback API override/);
  });

  it('rejects unsafe linked release content', async () => {
    const root = await release();
    await symlink(join(root, 'server', 'dist', 'server.js'), join(root, 'app', 'dist', 'linked.js'));
    await assert.rejects(() => validateProductionRelease(root), /unsafe link/);
  });

  it('requires every compiled production restore administration script', async () => {
    const root = await release();
    await rm(join(root, 'server', 'dist', 'scripts', 'recoverRuntimeRestore.js'));
    await assert.rejects(() => validateProductionRelease(root), /missing or unsafe/);
  });
});
