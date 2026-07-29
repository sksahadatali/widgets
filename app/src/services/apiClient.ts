const DEFAULT_TIMEOUT_MS = 30000;

export async function apiGet<T>(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller =
    new AbortController();

  const timeoutId =
    window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

  try {
    const response =
      await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        cache: 'no-store',
      });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    return (
      await response.json()
    ) as T;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        `API request timed out after ${timeoutMs / 1000} seconds`
      );
    }

    throw error;
  } finally {
    window.clearTimeout(
      timeoutId
    );
  }
}