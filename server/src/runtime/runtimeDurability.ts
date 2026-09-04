import { open } from 'node:fs/promises';

type DirectorySyncHandle = Pick<Awaited<ReturnType<typeof open>>, 'sync' | 'close'>;
export type DirectorySyncOpener = (path: string, flags: 'r') => Promise<DirectorySyncHandle>;

const UNSUPPORTED_DIRECTORY_SYNC_CODES = new Set([
  'EISDIR',
  'EINVAL',
  'EPERM',
  'ENOTSUP',
]);

/**
 * Synchronize directory metadata where the host filesystem supports it.
 * Windows and some filesystems reject directory handles/flushes using the
 * narrowly understood codes above. All other I/O errors remain fatal.
 */
export async function flushDirectory(
  path: string,
  openDirectory: DirectorySyncOpener = open,
): Promise<void> {
  try {
    const handle = await openDirectory(path, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (!UNSUPPORTED_DIRECTORY_SYNC_CODES.has(code)) throw error;
  }
}
