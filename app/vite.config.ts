import react from '@vitejs/plugin-react';

import {
  defineConfig,
  loadEnv,
} from 'vite';

type AppMode =
  | 'household'
  | 'demo';

export function assertProductionSameOriginApi(
  mode: string,
  apiBaseUrl: string | undefined
): void {
  if (mode !== 'development' && apiBaseUrl?.trim()) {
    throw new Error(
      'Production eY OS builds require VITE_API_BASE_URL to be empty so /api remains same-origin.'
    );
  }
}

export default defineConfig(
  ({ mode }) => {
    const env =
      loadEnv(
        mode,
        process.cwd(),
        ''
      );

    assertProductionSameOriginApi(mode, process.env.VITE_API_BASE_URL);
    assertProductionSameOriginApi(mode, env.VITE_API_BASE_URL);

    const configuredMode =
      (
        process.env.VITE_EY_MODE ??
        env.VITE_EY_MODE
      )
        ?.trim()
        .toLowerCase();

    if (
      configuredMode &&
      configuredMode !== 'household' &&
      configuredMode !== 'demo'
    ) {
      throw new Error(
        'VITE_EY_MODE must be household or demo.'
      );
    }

    const appMode: AppMode =
      configuredMode === 'household' ||
      configuredMode === 'demo'
        ? configuredMode
        : (
          mode === 'development'
            ? 'household'
            : 'demo'
        );

    return {
      plugins: [
        react(),
        {
          name: 'eyos-build-metadata',
          generateBundle() {
            this.emitFile({
              type: 'asset',
              fileName: 'eyos-build.json',
              source: `${JSON.stringify({
                schemaVersion: 1,
                appMode,
              }, null, 2)}\n`,
            });
          },
        },
      ],

      server: {
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        },
      },
    };
  }
);
