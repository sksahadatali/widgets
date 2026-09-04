import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { loadServiceEnvironment } from '../../server/src/config/serviceEnvironment.js';

const paths: string[] = [];
afterEach(async () => {
  delete process.env.EYOS_SYNTHETIC_SERVICE_VALUE;
  await Promise.all(paths.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('external Windows service environment', () => {
  it('loads an explicit absolute regular file and overrides ambient values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eyos-service-env-'));
    paths.push(root);
    const file = join(root, 'service.env');
    await writeFile(file, 'EYOS_SYNTHETIC_SERVICE_VALUE=external\n', 'utf8');
    process.env.EYOS_SYNTHETIC_SERVICE_VALUE = 'ambient';
    loadServiceEnvironment(file);
    assert.equal(process.env.EYOS_SYNTHETIC_SERVICE_VALUE, 'external');
  });

  it('fails closed for relative, missing, directory and linked paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eyos-service-env-'));
    paths.push(root);
    const file = join(root, 'service.env');
    const link = join(root, 'linked.env');
    await writeFile(file, 'VALUE=synthetic\n', 'utf8');
    await symlink(file, link);
    assert.throws(() => loadServiceEnvironment('service.env'), /absolute local path/);
    assert.throws(() => loadServiceEnvironment(join(root, 'missing.env')));
    assert.throws(() => loadServiceEnvironment(root), /regular file/);
    assert.throws(() => loadServiceEnvironment(link), /regular file/);
  });
});
