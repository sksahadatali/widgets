import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
import test from 'node:test';

const manifestUrl = new URL(
  '../../app/public/manifest.webmanifest',
  import.meta.url
);
const workerUrl = new URL(
  '../../app/public/service-worker.js',
  import.meta.url
);
const registrationUrl = new URL(
  '../../app/src/pwa/registerServiceWorker.ts',
  import.meta.url
);

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  orientation: string;
  prefer_related_applications: boolean;
  icons: ManifestIcon[];
}

function pngDimensions(buffer: Buffer): {
  width: number;
  height: number;
} {
  assert.deepEqual(
    buffer.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  );
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function pngChunkNames(buffer: Buffer): string[] {
  const names: string[] = [];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const name = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    names.push(name);
    offset += 12 + length;
  }

  return names;
}

test('manifest defines the minimal eY OS Android installation contract', async () => {
  const source = await readFile(manifestUrl, 'utf8');
  const manifest = JSON.parse(source) as WebAppManifest;

  assert.deepEqual(
    {
      id: manifest.id,
      name: manifest.name,
      short_name: manifest.short_name,
      start_url: manifest.start_url,
      scope: manifest.scope,
      display: manifest.display,
      theme_color: manifest.theme_color,
      background_color: manifest.background_color,
      orientation: manifest.orientation,
      prefer_related_applications:
        manifest.prefer_related_applications,
    },
    {
      id: '/',
      name: 'eY OS',
      short_name: 'eY OS',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#131c31',
      background_color: '#131c31',
      orientation: 'any',
      prefer_related_applications: false,
    }
  );
  assert.deepEqual(manifest.icons, [
    {
      src: '/icons/eyos-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/eyos-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/eyos-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ]);
  assert.doesNotMatch(
    source,
    /ayanoh|https?:|192\.168\.|household|cloudflare/i
  );
});

test('Android icons are dedicated metadata-free PNG assets at exact sizes', async () => {
  for (const [filename, size] of [
    ['eyos-192.png', 192],
    ['eyos-512.png', 512],
    ['eyos-maskable-512.png', 512],
  ] as const) {
    const buffer = await readFile(
      new URL(`../../app/public/icons/${filename}`, import.meta.url)
    );
    assert.deepEqual(pngDimensions(buffer), {
      width: size,
      height: size,
    });
    assert.equal(
      pngChunkNames(buffer).some(name =>
        ['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(name)
      ),
      false
    );
  }

  const regular = await readFile(
    new URL('../../app/public/icons/eyos-512.png', import.meta.url)
  );
  const maskable = await readFile(
    new URL('../../app/public/icons/eyos-maskable-512.png', import.meta.url)
  );
  assert.notDeepEqual(maskable, regular);
});

test('service worker is lifecycle-only and cannot intercept or cache requests', async () => {
  const source = await readFile(workerUrl, 'utf8');

  assert.match(source, /addEventListener\('install'/);
  assert.match(source, /skipWaiting\(\)/);
  assert.match(source, /addEventListener\('activate'/);
  assert.match(source, /clients\.claim\(\)/);
  assert.doesNotMatch(source, /addEventListener\(['"]fetch/);
  assert.doesNotMatch(source, /\bcaches\b|CacheStorage|precache|runtimeCaching/i);
  assert.doesNotMatch(source, /\/api|\/health|index\.html|offline/i);
  assert.doesNotMatch(source, /ayanoh|cloudflare|192\.168\.|household/i);
});

test('registration is production-only, same-origin, and checks for updates', async () => {
  const source = await readFile(registrationUrl, 'utf8');

  assert.match(source, /!import\.meta\.env\.PROD/);
  assert.match(source, /'serviceWorker' in navigator/);
  assert.match(source, /register\(\s*'\/service-worker\.js'/);
  assert.match(source, /scope:\s*'\/'/);
  assert.match(source, /updateViaCache:\s*'none'/);
  assert.match(source, /await registration\.update\(\)/);
  assert.match(source, /catch\s*{/);
  assert.doesNotMatch(source, /ayanoh|cloudflare|192\.168\.|household/i);
});

test('application head and bootstrap retain the PWA and Household boundaries', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../../app/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../app/src/main.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /name="theme-color" content="#131c31"/);
  assert.match(main, /void registerServiceWorker\(\)/);
  assert.match(main, /void bootstrapHouseholdConfig\(\)\.then/);
  assert.match(main, /eY OS unavailable/);
});
