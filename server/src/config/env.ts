import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),

  nest: {
    clientId: required('NEST_CLIENT_ID'),
    clientSecret: required('NEST_CLIENT_SECRET'),
    refreshToken: required('NEST_REFRESH_TOKEN'),
    projectId: required('NEST_PROJECT_ID'),
    deviceName: required('NEST_DEVICE_NAME'),
  },
};