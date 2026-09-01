import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  afterEach,
  describe,
  it,
} from 'node:test';

import {
  readFrontendBuildMetadata,
} from '../../server/src/config/frontendBuild.js';

const temporaryPaths: string[] = [];

async function fixture(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), 'ey-build-metadata-')
  );
  temporaryPaths.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map(path =>
      rm(path, { recursive: true, force: true })
    )
  );
});

describe('frontend build metadata', () => {
  it('reads the minimal Demo/Household startup boundary', async () => {
    const directory = await fixture();
    await writeFile(
      join(directory, 'eyos-build.json'),
      '{"schemaVersion":1,"appMode":"household"}\n',
      'utf8'
    );

    assert.deepEqual(
      await readFrontendBuildMetadata(directory),
      { schemaVersion: 1, appMode: 'household' }
    );
  });

  it('rejects missing, malformed, secret-bearing, or unknown metadata', async () => {
    const directory = await fixture();
    await assert.rejects(
      () => readFrontendBuildMetadata(directory),
      /missing or malformed/
    );

    for (const value of [
      '{bad',
      '{"schemaVersion":1,"appMode":"unknown"}',
      '{"schemaVersion":1,"appMode":"demo","secret":"no"}',
    ]) {
      await writeFile(
        join(directory, 'eyos-build.json'),
        value,
        'utf8'
      );
      await assert.rejects(
        () => readFrontendBuildMetadata(directory)
      );
    }
  });
});
