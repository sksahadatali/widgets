import { rename } from 'node:fs/promises';

const WINDOWS_RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 800, 1600] as const;
const WINDOWS_RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

export type AtomicPublicationOptions = {
  platform?: NodeJS.Platform;
  renamer?: (source: string, target: string) => Promise<void>;
  sleeper?: (delayMs: number) => Promise<void>;
};

/** Only the rename syscall is retried. Guards and durability remain caller-owned. */
export async function publishAtomicRename(options: AtomicPublicationOptions & {
  source: string;
  target: string;
  beforeAttempt: () => Promise<void>;
}): Promise<void> {
  const platform = options.platform ?? process.platform;
  const renamer = options.renamer ?? rename;
  const sleeper = options.sleeper ?? (async delayMs => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  });
  const maximumAttempts = platform === 'win32' ? WINDOWS_RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    // A permission/validation failure here is not a transient rename failure.
    await options.beforeAttempt();
    try {
      await renamer(options.source, options.target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code ?? '';
      if (platform !== 'win32' || !WINDOWS_RETRYABLE_CODES.has(code) || attempt >= WINDOWS_RETRY_DELAYS_MS.length) throw error;
      await sleeper(WINDOWS_RETRY_DELAYS_MS[attempt]);
    }
  }
}
