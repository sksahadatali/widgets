import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { win32 } from 'node:path';

const execFileAsync = promisify(execFile);

const WINDOWS_BOOT_TIME_COMMAND = [
  '$boot = (Get-CimInstance -ClassName Win32_OperatingSystem).LastBootUpTime',
  "[Console]::Out.Write($boot.ToUniversalTime().Ticks)",
].join('; ');

export function parseWindowsBootTicks(value: string): string {
  const ticks = value.trim();
  if (!/^[0-9]{10,}$/.test(ticks)) {
    throw new Error('Windows boot identity is invalid.');
  }
  return `win32:${ticks}`;
}

export function getWindowsPowerShellPath(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const systemRoot = environment.SystemRoot?.trim();
  if (!systemRoot || !/^[A-Za-z]:\\/.test(systemRoot)) {
    throw new Error('Windows SystemRoot is unavailable or invalid.');
  }
  return win32.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
}

export async function readSystemBootIdentity(
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  if (platform === 'win32') {
    const { stdout } = await execFileAsync(
      getWindowsPowerShellPath(),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        WINDOWS_BOOT_TIME_COMMAND,
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    return parseWindowsBootTicks(stdout);
  }

  if (platform === 'linux') {
    const bootId = (
      await readFile(
        '/proc/sys/kernel/random/boot_id',
        'utf8',
      )
    ).trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(bootId)) {
      throw new Error('Linux boot identity is invalid.');
    }
    return `linux:${bootId}`;
  }

  return null;
}
