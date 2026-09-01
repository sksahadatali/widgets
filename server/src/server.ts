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
  await preflightRuntimeData(runtime);

  const [
    { createApp },
    { reconcileRoutineRewards },
  ] = await Promise.all([
    import('./app.js'),
    import('./services/routineRewardReconciler.js'),
  ]);
  const app = createApp({
    mode: serverMode,
    frontendOrigin: env.frontendOrigin,
  });

  app.listen(env.port, () => {
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
}

void start().catch(error => {
  console.error('eY OS failed to start.', error);
  process.exitCode = 1;
});
