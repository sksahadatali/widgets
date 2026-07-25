import { env } from '../config/env';
import { getAccessToken } from './googleAuthService';

export async function getNestStatus() {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `https://smartdevicemanagement.googleapis.com/v1/enterprises/${env.nest.projectId}/devices`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Nest API error: ${error}`);
  }

  return response.json();
}