import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type ProductionReleaseManifest = {
  schemaVersion: 1;
  commit: string;
  tree: string;
  appMode: 'household';
  apiTopology: 'same-origin';
  nodeMajor: number;
  builtAt: string;
};

async function requireReal(path: string, kind: 'file' | 'directory'): Promise<void> {
  const value = await lstat(path);
  if (value.isSymbolicLink() || (kind === 'file' ? !value.isFile() : !value.isDirectory())) {
    throw new Error(`Production release ${kind} is missing or unsafe.`);
  }
}

export async function validateProductionRelease(releaseRoot: string): Promise<ProductionReleaseManifest> {
  const manifestPath = join(releaseRoot, 'eyos-release.json');
  const appDist = join(releaseRoot, 'app', 'dist');
  const serverDist = join(releaseRoot, 'server', 'dist');
  await Promise.all([
    requireReal(releaseRoot, 'directory'),
    requireReal(manifestPath, 'file'),
    requireReal(appDist, 'directory'),
    requireReal(join(appDist, 'index.html'), 'file'),
    requireReal(join(appDist, 'eyos-build.json'), 'file'),
    requireReal(serverDist, 'directory'),
    requireReal(join(serverDist, 'server.js'), 'file'),
    requireReal(join(releaseRoot, 'server', 'node_modules'), 'directory'),
    requireReal(join(releaseRoot, 'server', 'package.json'), 'file'),
    requireReal(join(releaseRoot, 'node', process.platform === 'win32' ? 'node.exe' : 'node'), 'file'),
  ]);

  let manifest: unknown;
  let frontend: unknown;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    frontend = JSON.parse(await readFile(join(appDist, 'eyos-build.json'), 'utf8'));
  } catch {
    throw new Error('Production release metadata is malformed.');
  }
  const value = manifest as Record<string, unknown>;
  const expectedKeys = ['apiTopology', 'appMode', 'builtAt', 'commit', 'nodeMajor', 'schemaVersion', 'tree'];
  if (
    !value || typeof value !== 'object' || Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys) ||
    value.schemaVersion !== 1 || value.appMode !== 'household' ||
    value.apiTopology !== 'same-origin' ||
    typeof value.commit !== 'string' || !/^[0-9a-f]{40}$/.test(value.commit) ||
    typeof value.tree !== 'string' || !/^[0-9a-f]{40}$/.test(value.tree) ||
    value.nodeMajor !== Number(process.versions.node.split('.')[0]) ||
    typeof value.builtAt !== 'string' || Number.isNaN(Date.parse(value.builtAt))
  ) {
    throw new Error('Production release metadata is invalid.');
  }
  if (JSON.stringify(frontend) !== JSON.stringify({ schemaVersion: 1, appMode: 'household' })) {
    throw new Error('Production release does not contain a Household frontend build.');
  }

  const pending = [appDist];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Production frontend contains an unsafe link.');
      if (entry.isDirectory()) pending.push(path);
      if (entry.isFile() && /\.(?:html|js|json|css|map)$/i.test(entry.name)) {
        const content = await readFile(path, 'utf8');
        if (/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api/i.test(content)) {
          throw new Error('Production frontend contains a loopback API override.');
        }
      }
    }
  }
  return manifest as ProductionReleaseManifest;
}
