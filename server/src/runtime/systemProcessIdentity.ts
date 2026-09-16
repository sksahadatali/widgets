import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { getWindowsPowerShellPath } from './systemBootIdentity.js';

const execFileAsync = promisify(execFile);

export function parseWindowsProcessTicks(value: string): string | null {
  const ticks = value.trim();
  if (ticks === 'absent') return null;
  if (!/^[0-9]{10,}$/.test(ticks)) {
    throw new Error('Windows process identity is invalid.');
  }
  return `win32:${ticks}`;
}

export function parseLinuxProcessStat(value: string): string {
  const commandEnd = value.lastIndexOf(') ');
  if (commandEnd < 0) {
    throw new Error('Linux process identity is invalid.');
  }
  const fieldsAfterCommand = value.slice(commandEnd + 2).trim().split(/\s+/);
  const startTime = fieldsAfterCommand[19];
  if (!startTime || !/^[0-9]+$/.test(startTime)) {
    throw new Error('Linux process identity is invalid.');
  }
  return `linux:${startTime}`;
}

function assertPid(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('Process ID is invalid.');
  }
}

export async function readSystemProcessIdentity(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  assertPid(pid);

  if (platform === 'win32') {
    const command = [
      `$process = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}'`,
      "if ($null -eq $process) { [Console]::Out.Write('absent') } else { [Console]::Out.Write($process.CreationDate.ToUniversalTime().Ticks) }",
    ].join('; ');
    const { stdout } = await execFileAsync(
      getWindowsPowerShellPath(),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        command,
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    return parseWindowsProcessTicks(stdout);
  }

  if (platform === 'linux') {
    try {
      return parseLinuxProcessStat(
        await readFile(
          pid === process.pid ? '/proc/self/stat' : `/proc/${pid}/stat`,
          'utf8',
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  return null;
}

export function isSystemProcessIdentity(value: string): boolean {
  return /^(?:win32:[0-9]{10,}|linux:[0-9]+)$/.test(value);
}
