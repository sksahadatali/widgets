import { env } from './config/env.js';
import { createApp } from './app.js';
import { reconcileRoutineRewards } from './services/routineRewardReconciler.js';

const isProduction =
  process.argv.includes('--production');
const app = createApp({
  mode: isProduction
    ? 'production'
    : 'development',
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
  void reconcileRoutineRewards().catch(() => {
    console.error(
      'Automatic Routine reward startup reconciliation is pending.'
    );
  });
});
