import dotenv from 'dotenv';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export function loadServiceEnvironment(environmentFile: string): void {
  const configuredPath = environmentFile.trim();
  if (!configuredPath || !isAbsolute(configuredPath)) {
    throw new Error('EYOS_SERVICE_ENV_FILE must be an absolute local path.');
  }

  const stats = lstatSync(configuredPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('EYOS_SERVICE_ENV_FILE must identify a real regular file.');
  }
  if (realpathSync(configuredPath) !== resolve(configuredPath)) {
    throw new Error('EYOS_SERVICE_ENV_FILE must not resolve through a link.');
  }

  const result = dotenv.config({
    path: configuredPath,
    override: true,
    quiet: true,
  });
  if (result.error) {
    throw new Error('EYOS_SERVICE_ENV_FILE could not be loaded.', {
      cause: result.error,
    });
  }
}
