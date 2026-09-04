import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LAN_BIND_HOST,
  LOOPBACK_BIND_HOST,
  listenWithNetworkBinding,
  resolveNetworkBinding,
} from '../../server/src/config/networkBinding.js';
import { handleListenFailure } from '../../server/src/serverLifecycle.js';
import type { RuntimeOperationLock } from '../../server/src/runtime/runtimeOperationLock.js';

describe('Home Service network binding', () => {
  it('defaults to safe loopback with LAN access disabled', () => {
    assert.deepEqual(resolveNetworkBinding({}), {
      host: LOOPBACK_BIND_HOST,
      trustedLanAccess: false,
    });
  });

  it('accepts explicit loopback with LAN access false', () => {
    assert.deepEqual(resolveNetworkBinding({
      EYOS_BIND_HOST: '127.0.0.1',
      EYOS_TRUSTED_LAN_ACCESS: 'false',
    }), {
      host: LOOPBACK_BIND_HOST,
      trustedLanAccess: false,
    });
  });

  it('rejects wildcard binding without explicit acknowledgement', () => {
    assert.throws(
      () => resolveNetworkBinding({ EYOS_BIND_HOST: '0.0.0.0' }),
      /requires EYOS_TRUSTED_LAN_ACCESS=true/
    );
  });

  it('accepts wildcard binding with explicit acknowledgement', () => {
    assert.deepEqual(resolveNetworkBinding({
      EYOS_BIND_HOST: '0.0.0.0',
      EYOS_TRUSTED_LAN_ACCESS: 'true',
    }), {
      host: LAN_BIND_HOST,
      trustedLanAccess: true,
    });
  });

  it('passes the resolved host and port to the listener', () => {
    const calls: unknown[][] = [];
    const callback = () => undefined;
    const expectedServer = { kind: 'synthetic-server' };
    const target = {
      listen(port: number, host: string, onListening: () => void) {
        calls.push([port, host, onListening]);
        return expectedServer;
      },
    };

    const server = listenWithNetworkBinding(
      target,
      3001,
      { host: LAN_BIND_HOST, trustedLanAccess: true },
      callback
    );

    assert.equal(server, expectedServer);
    assert.deepEqual(calls, [[3001, LAN_BIND_HOST, callback]]);
  });

  it('rejects LAN acknowledgement with loopback binding', () => {
    assert.throws(
      () => resolveNetworkBinding({
        EYOS_BIND_HOST: '127.0.0.1',
        EYOS_TRUSTED_LAN_ACCESS: 'true',
      }),
      /requires EYOS_BIND_HOST=0.0.0.0/
    );
  });

  for (const host of [
    '192.168.1.20',
    '10.0.0.4',
    '172.16.0.8',
    '8.8.8.8',
    '::',
    '::1',
    'home-pc',
    'http://127.0.0.1',
    '127.0.0.1:3001',
    '0.0.0',
    'not an address',
  ]) {
    it(`rejects unsupported bind host ${host}`, () => {
      assert.throws(
        () => resolveNetworkBinding({
          EYOS_BIND_HOST: host,
          EYOS_TRUSTED_LAN_ACCESS: 'true',
        }),
        /must be exactly 127\.0\.0\.1 or 0\.0\.0\.0/
      );
    });
  }

  for (const value of ['1', 'yes', 'TRUE', 'true ', 'enabled', '']) {
    it(`rejects non-exact boolean value ${JSON.stringify(value)}`, () => {
      assert.throws(
        () => resolveNetworkBinding({
          EYOS_TRUSTED_LAN_ACCESS: value,
        }),
        /must be exactly true or false/
      );
    });
  }
});

describe('listener lifecycle', () => {
  it('releases the owned runtime lock after listener failure', async () => {
    const lock = {
      lockPath: '/synthetic/runtime.lock',
      owner: {
        schemaVersion: 1,
        operationId: '00000000-0000-4000-8000-000000000001',
        operation: 'server',
        pid: 123,
        hostname: 'synthetic-host',
        startedAt: '2026-09-04T00:00:00.000Z',
      },
    } as RuntimeOperationLock;
    const released: RuntimeOperationLock[] = [];
    const reported: unknown[][] = [];
    const listenError = new Error('synthetic listener failure');

    await handleListenFailure(lock, listenError, {
      releaseLock: async ownedLock => {
        released.push(ownedLock);
      },
      reportError: (...values) => reported.push(values),
    });

    assert.deepEqual(released, [lock]);
    assert.deepEqual(reported, [[
      'eY OS server failed to listen.',
      listenError,
    ]]);
  });

  it('reports lock-release failure as well as listener failure', async () => {
    const lock = {} as RuntimeOperationLock;
    const lockError = new Error('synthetic release failure');
    const listenError = new Error('synthetic listener failure');
    const reported: unknown[][] = [];

    await handleListenFailure(lock, listenError, {
      releaseLock: async () => {
        throw lockError;
      },
      reportError: (...values) => reported.push(values),
    });

    assert.deepEqual(reported, [
      ['eY OS runtime operation lock release failed.', lockError],
      ['eY OS server failed to listen.', listenError],
    ]);
  });
});
