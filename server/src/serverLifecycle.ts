import {
  releaseRuntimeOperationLock,
  type RuntimeOperationLock,
} from './runtime/runtimeOperationLock.js';
import type { Server } from 'node:http';

interface ListenFailureDependencies {
  releaseLock?: typeof releaseRuntimeOperationLock;
  reportError?: (...values: unknown[]) => void;
}

export async function handleListenFailure(
  operationLock: RuntimeOperationLock | null,
  serverError: Error,
  dependencies: ListenFailureDependencies = {}
): Promise<void> {
  const releaseLock =
    dependencies.releaseLock ?? releaseRuntimeOperationLock;
  const reportError = dependencies.reportError ?? console.error;

  if (operationLock) {
    try {
      await releaseLock(operationLock);
    } catch (lockError) {
      reportError(
        'eY OS runtime operation lock release failed.',
        lockError
      );
    }
  }

  reportError('eY OS server failed to listen.', serverError);
}

interface ShutdownDependencies {
  releaseLock?: typeof releaseRuntimeOperationLock;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  timeoutMs?: number;
}

type ClosableServer = Pick<Server, 'close'> & {
  closeIdleConnections?: () => void;
};

export async function shutdownServer(
  server: ClosableServer,
  operationLock: RuntimeOperationLock | null,
  dependencies: ShutdownDependencies = {},
): Promise<void> {
  const releaseLock =
    dependencies.releaseLock ?? releaseRuntimeOperationLock;
  const scheduleTimeout = dependencies.setTimeout ?? globalThis.setTimeout;
  const cancelTimeout = dependencies.clearTimeout ?? globalThis.clearTimeout;
  const timeoutMs = dependencies.timeoutMs ?? 45_000;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = scheduleTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(
        'eY OS server shutdown timed out; the runtime lock was retained.',
      ));
    }, timeoutMs);
    timeout.unref?.();

    server.close(serverError => {
      queueMicrotask(() => {
        if (settled) return;
        settled = true;
        cancelTimeout(timeout);
        if (serverError) {
          reject(new Error('eY OS server shutdown failed.', {
            cause: serverError,
          }));
          return;
        }
        void (operationLock
          ? releaseLock(operationLock)
          : Promise.resolve()
        ).then(resolve, reject);
      });
    });
    server.closeIdleConnections?.();
  });
}
