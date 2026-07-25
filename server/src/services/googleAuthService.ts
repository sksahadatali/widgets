import { env } from '../config/env.js';

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

type GoogleOAuthErrorResponse = {
  error?: string;
  error_description?: string;
};

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

function hasValidCachedToken(): boolean {
  return (
    cachedAccessToken !== null &&
    Date.now() < cachedAccessTokenExpiresAt
  );
}

async function readOAuthError(
  response: Response
): Promise<string> {
  try {
    const errorData =
      (await response.json()) as GoogleOAuthErrorResponse;

    const error = errorData.error ?? 'unknown_error';
    const description =
      errorData.error_description ??
      'Google did not provide an error description.';

    return `${error}: ${description}`;
  } catch {
    return `Google OAuth returned HTTP ${response.status}.`;
  }
}

export async function getAccessToken(): Promise<string> {
  if (hasValidCachedToken()) {
    return cachedAccessToken as string;
  }

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
    const errorMessage = await readOAuthError(response);

    console.error(`Google OAuth error: ${errorMessage}`);

    throw new Error(
      `Unable to refresh Google access token: ${errorMessage}`
    );
  }

  const data =
    (await response.json()) as GoogleTokenResponse;

  if (!data.access_token) {
    throw new Error(
      'Google OAuth response did not contain an access token.'
    );
  }

  const expiresInMilliseconds =
    Math.max(data.expires_in, 300) * 1000;

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt =
    Date.now() +
    expiresInMilliseconds -
    TOKEN_EXPIRY_BUFFER_MS;

  return data.access_token;
}