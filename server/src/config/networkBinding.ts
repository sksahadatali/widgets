export const LOOPBACK_BIND_HOST = '127.0.0.1';
export const LAN_BIND_HOST = '0.0.0.0';

export interface NetworkBinding {
  host: typeof LOOPBACK_BIND_HOST | typeof LAN_BIND_HOST;
  trustedLanAccess: boolean;
}

function parseTrustedLanAccess(value: string | undefined): boolean {
  if (value === undefined) return false;

  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new Error(
    'EYOS_TRUSTED_LAN_ACCESS must be exactly true or false.'
  );
}

export function resolveNetworkBinding(
  source: NodeJS.ProcessEnv = process.env
): NetworkBinding {
  const host = source.EYOS_BIND_HOST ?? LOOPBACK_BIND_HOST;
  const trustedLanAccess = parseTrustedLanAccess(
    source.EYOS_TRUSTED_LAN_ACCESS
  );

  if (host === LOOPBACK_BIND_HOST) {
    if (trustedLanAccess) {
      throw new Error(
        'EYOS_TRUSTED_LAN_ACCESS=true requires EYOS_BIND_HOST=0.0.0.0.'
      );
    }
    return { host, trustedLanAccess: false };
  }

  if (host === LAN_BIND_HOST) {
    if (!trustedLanAccess) {
      throw new Error(
        'EYOS_BIND_HOST=0.0.0.0 requires EYOS_TRUSTED_LAN_ACCESS=true.'
      );
    }
    return { host, trustedLanAccess: true };
  }

  throw new Error(
    'EYOS_BIND_HOST must be exactly 127.0.0.1 or 0.0.0.0.'
  );
}

interface ListenTarget<TServer> {
  listen(
    port: number,
    host: string,
    callback: () => void
  ): TServer;
}

export function listenWithNetworkBinding<TServer>(
  target: ListenTarget<TServer>,
  port: number,
  binding: NetworkBinding,
  callback: () => void
): TServer {
  return target.listen(port, binding.host, callback);
}
