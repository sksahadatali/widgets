import {
  existsSync,
} from 'node:fs';

import {
  fileURLToPath,
} from 'node:url';

import react from '@vitejs/plugin-react';

import {
  defineConfig,
  loadEnv,
} from 'vite';

type AppMode =
  | 'household'
  | 'demo';

export default defineConfig(
  ({ mode }) => {
    const env =
      loadEnv(
        mode,
        process.cwd(),
        ''
      );

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

    const configFile =
      appMode === 'household'
        ? './src/config/household.local.json'
        : './src/config/household.example.json';

    const configPath =
      fileURLToPath(
        new URL(
          configFile,
          import.meta.url
        )
      );

    if (
      appMode === 'household' &&
      !existsSync(configPath)
    ) {
      throw new Error(
        'eY OS is running in Household mode, but ' +
        'app/src/config/household.local.json is missing. ' +
        'Create it from household.example.json and add ' +
        'the real household values locally. This file ' +
        'must never be committed.'
      );
    }

    return {
      plugins: [
        react(),
      ],

      resolve: {
        alias: {
          '@household-config':
            configPath,
        },
      },
    };
  }
);
