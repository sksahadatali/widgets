import { env } from './config/env.js';
import {
  configureRuntimeData,
} from './config/runtimeData.js';
import {
  readFrontendBuildMetadata,
} from './config/frontendBuild.js';
import {
  preflightRuntimeData,
} from './runtime/runtimeValidation.js';
import { loadHouseholdConfig } from './config/householdConfig.js';
import {
  acquireRuntimeOperationLock,
  releaseRuntimeOperationLock,
  type RuntimeOperationLock,
} from './runtime/runtimeOperationLock.js';
import { readRuntimeRestoreJournal } from './runtime/runtimeRestoreJournal.js';

const isProduction =
  process.argv.includes('--production');
const serverMode = isProduction
  ? 'production'
  : 'development';

async function start(): Promise<void> {
  const appMode = isProduction
    ? (await readFrontendBuildMetadata()).appMode
    : 'household';
  const runtime = configureRuntimeData({
    serverMode,
    appMode,
    runtimeDirectory: env.runtimeDirectory,
  });
  let operationLock: RuntimeOperationLock | null = null;
  try {
    if (runtime.policy === 'required' && runtime.rootPath) {
      if (await readRuntimeRestoreJournal(runtime.rootPath)) {
        throw new Error('RESTORE_RECOVERY_REQUIRED');
      }
      operationLock = await acquireRuntimeOperationLock({
        runtimeRoot: runtime.rootPath,
        operation: 'server',
      });
    }
    await preflightRuntimeData(runtime);
    await loadHouseholdConfig({
      appMode,
      rootPath: runtime.rootPath,
      serverMode,
    });

    const [
      { createApp },
      { reconcileRoutineRewards },
    ] = await Promise.all([
      import('./app.js'),
      import('./services/routineRewardReconciler.js'),
    ]);
    const app = createApp({
      mode: serverMode,
      appMode,
      frontendOrigin: env.frontendOrigin,
    });

    const server = app.listen(env.port, () => {
      server.removeListener('error', handleStartupError);
      console.log(
        `eY OS ${
          isProduction
            ? 'production service'
            : 'development API'
        } running at http://localhost:${env.port}`
      );

      if (runtime.policy !== 'disabled') {
        void reconcileRoutineRewards().catch(() => {
          console.error(
            'Automatic Routine reward startup reconciliation is pending.'
          );
        });
      }
    });
    let stopping = false;
    const handleStartupError = (serverError: Error) => {
      if (stopping) return;
      stopping = true;
      void (operationLock
        ? releaseRuntimeOperationLock(operationLock)
        : Promise.resolve()
      ).catch(lockError => {
        console.error('eY OS runtime operation lock release failed.', lockError);
      }).finally(() => {
        console.error('eY OS server failed to listen.', serverError);
        process.exitCode = 1;
      });
    };
    server.once('error', handleStartupError);
    const stop = () => {
      if (stopping) return;
      stopping = true;
      server.close(serverError => {
        if (serverError) {
          console.error('eY OS server shutdown failed.', serverError);
        }
        void (operationLock
          ? releaseRuntimeOperationLock(operationLock)
          : Promise.resolve()
        ).then(() => {
          process.exitCode = serverError ? 1 : 0;
        }).catch(lockError => {
          console.error('eY OS runtime operation lock release failed.', lockError);
          process.exitCode = 1;
        });
      });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    if (operationLock) {
      await releaseRuntimeOperationLock(operationLock).catch(() => undefined);
    }
    throw error;
  }
}

void start().catch(error => {
  console.error('eY OS failed to start.', error);
  process.exitCode = 1;
});
