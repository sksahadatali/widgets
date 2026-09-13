export async function registerServiceWorker(): Promise<void> {
  if (
    !import.meta.env.PROD ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  try {
    const registration =
      await navigator.serviceWorker.register(
        '/service-worker.js',
        {
          scope: '/',
          updateViaCache: 'none',
        }
      );

    await registration.update();
  } catch {
    console.warn(
      'eY OS service worker registration failed.'
    );
  }
}
