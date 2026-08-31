const CONFIGURED_API_BASE =
  import.meta.env?.VITE_API_BASE_URL?.trim() ?? '';

function normalizeApiBase(base: string): string {
  return base.replace(/\/+$/, '');
}

export function resolveApiUrl(
  path: string,
  base = CONFIGURED_API_BASE
): string {
  if (
    path !== '/api' &&
    !path.startsWith('/api/')
  ) {
    throw new Error(
      'eY OS API paths must start with /api.'
    );
  }

  return `${normalizeApiBase(base.trim())}${path}`;
}

export function apiUrl(path: string): string {
  return resolveApiUrl(path);
}
