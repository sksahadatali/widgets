import dotenv from 'dotenv';
import { resolveNetworkBinding } from './networkBinding.js';
import { loadServiceEnvironment } from './serviceEnvironment.js';

if (process.env.EYOS_SERVICE_ENV_FILE) {
  loadServiceEnvironment(process.env.EYOS_SERVICE_ENV_FILE);
} else {
  dotenv.config({ quiet: true });
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3001);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

export const env = {
  port: parsePort(process.env.PORT),

  network: resolveNetworkBinding(),

  frontendOrigin:
    process.env.FRONTEND_ORIGIN?.trim() ??
    'http://localhost:5173',

  runtimeDirectory:
    process.env.EYOS_RUNTIME_DIR?.trim(),

  nest: {
    clientId: required('NEST_CLIENT_ID'),
    clientSecret: required('NEST_CLIENT_SECRET'),
    refreshToken: required('NEST_REFRESH_TOKEN'),
    projectId: required('NEST_PROJECT_ID'),
    deviceName: required('NEST_DEVICE_NAME'),
  },

  notion: {
    token: required('NOTION_TOKEN'),
    tasksDataSourceId: required(
      'NOTION_TASKS_DATA_SOURCE_ID'
    ),
  },
} as const;
