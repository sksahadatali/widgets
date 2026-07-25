import { env } from '../config/env';

type TokenResponse = {
  access_token: string;
};

export async function getAccessToken(): Promise<string> {
  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.nest.clientId,
        client_secret: env.nest.clientSecret,
        refresh_token: env.nest.refreshToken,
        grant_type: 'refresh_token',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
  
    console.error('Google OAuth Error:', error);
  
    throw new Error(`Unable to refresh Google access token: ${error}`);
  }

  const data =
    (await response.json()) as TokenResponse;

  return data.access_token;
}