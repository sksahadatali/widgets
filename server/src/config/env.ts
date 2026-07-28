import dotenv from 'dotenv';

dotenv.config({
  quiet: true,
});

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

  frontendOrigin:
    process.env.FRONTEND_ORIGIN?.trim() ??
    'http://localhost:5173',

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