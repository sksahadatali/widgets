import {
  releaseRuntimeOperationLock,
  type RuntimeOperationLock,
} from './runtime/runtimeOperationLock.js';

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
