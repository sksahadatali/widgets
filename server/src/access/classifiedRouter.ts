import { Router, type Request, type Response, type RequestHandler, type Express, type ErrorRequestHandler } from 'express';
import { getRuntimeAppMode } from '../config/householdConfig.js';
import { AccessError, assertHouseholdAccess, withHouseholdAccess, type HouseholdAccessContext } from './householdAccess.js';
import { validateRouteMembers } from './memberContext.js';

export type Classification = 'PUBLIC' | 'HOUSEHOLD' | 'DEMO';
export type RouteDefinition = { domain: string; method: string; path: string; classification: Classification; demo?: boolean };
const definitions: RouteDefinition[] = [];
const classifiedHandlers = new WeakSet<Function>();
const publicHandlers = new WeakSet<Function>();
const infrastructureHandlers = new WeakSet<Function>();
/** Explicit transport/static/error middleware; never a domain endpoint. */
export function infrastructureUse(app: Express, handler: RequestHandler): void;
export function infrastructureUse(app: Express, path: string, handler: RequestHandler): void;
export function infrastructureUse(app: Express, handler: ErrorRequestHandler): void;
export function infrastructureUse(app: Express, pathOrHandler: string | RequestHandler | ErrorRequestHandler, handler?: RequestHandler): void {
  if (typeof pathOrHandler === 'string') {
    infrastructureHandlers.add(handler!);
    app.use(pathOrHandler, handler!);
  } else {
    infrastructureHandlers.add(pathOrHandler);
    app.use(pathOrHandler);
  }
}
export function publicGet(app: Express, path: string, handler: RequestHandler): void {
  publicHandlers.add(handler);
  app.get(path, handler);
}
export function routeManifest(): readonly RouteDefinition[] { return definitions.map(item => ({ ...item })); }
export type AuditRecord = { route: string; classification: Classification; decision: 'ALLOW' | 'DENY'; code: string; timestamp: string };
export type AccessBoundary = { mode: 'household' | 'demo'; context?: HouseholdAccessContext; audit?: (record: AuditRecord) => void };
const defaultAudit = (record: AuditRecord) => console.info('EYOS_ACCESS', JSON.stringify(record));
export function accessErrorResponse(error: AccessError, response: Response): void {
  response.set('Cache-Control', 'no-store').status(error.status).json({ success: false, code: error.code, error: error.message });
}

const repeatedIdentityFields = new WeakSet<object>();
/** JSON parser verification: detect repeated top-level assertion keys, including escaped keys.
 * No body or values are retained. Nested domain data and free text are not identity inputs. */
export function inspectIdentityJson(request: object, _response: unknown, buffer: Buffer): void {
  const tokens = buffer.toString('utf8').match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g) ?? [];
  let depth = 0;
  let keyExpected = false;
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token === '{' || token === '[') { depth++; if (depth === 1) keyExpected = token === '{'; }
    else if (token === '}' || token === ']') depth--;
    else if (depth === 1 && token === ',') keyExpected = true;
    else if (depth === 1 && keyExpected && token.startsWith('"')) {
      let key: string;
      try { key = JSON.parse(token); } catch { return; } // express.json handles malformed JSON
      if (key === 'householdId' || key === 'appMode') {
        if (seen.has(key)) repeatedIdentityFields.add(request);
        seen.add(key);
      }
      keyExpected = false;
    }
  }
}

function assertions(request: Request, boundary: AccessBoundary): void {
  if (repeatedIdentityFields.has(request)) throw new AccessError('HOUSEHOLD_SCOPE_MISMATCH');
  // Headers and top-level query/body fields are the only supported assertion locations.
  for (const [header, field] of [['x-eyos-household-id', 'householdId'], ['x-eyos-app-mode', 'appMode']] as const) {
    const values: unknown[] = [];
    const headerCount = request.rawHeaders.filter((_, i) => i % 2 === 0 && request.rawHeaders[i].toLowerCase() === header).length;
    if (headerCount > 1) throw new AccessError('HOUSEHOLD_SCOPE_MISMATCH');
    if (request.get(header) !== undefined) values.push(request.get(header));
    if (Object.hasOwn(request.query, field)) values.push(request.query[field]);
    if (request.body && typeof request.body === 'object' && Object.hasOwn(request.body, field)) values.push(request.body[field]);
    if (values.length > 1 || values.some(value => typeof value !== 'string' || !value || value !== value.trim())) throw new AccessError('HOUSEHOLD_SCOPE_MISMATCH');
    if (!values.length) continue;
    if (field === 'appMode') {
      if (values[0] !== boundary.mode) throw new AccessError('DEMO_HOUSEHOLD_CROSSOVER');
    } else if (boundary.mode === 'demo') throw new AccessError('DEMO_HOUSEHOLD_CROSSOVER');
    else if (values[0] !== boundary.context?.householdId) throw new AccessError('HOUSEHOLD_SCOPE_MISMATCH');
  }
}
/** Mandatory classification is supplied per endpoint, never inferred from its prefix. */
export function classifiedRouter(domain: string) {
  const router = Router();
  const result = { router } as { router: ReturnType<typeof Router> } & Record<'get' | 'post' | 'put' | 'patch' | 'delete', (path: string, classification: Classification, handler: RequestHandler<Record<string, string>>, demo?: RequestHandler<Record<string, string>>) => void>;
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    result[method] = (path, classification, handler, demo) => {
      if (!['PUBLIC', 'HOUSEHOLD', 'DEMO'].includes(classification)) throw new Error('UNCLASSIFIED_API_ROUTE');
      definitions.push({ domain, method: method.toUpperCase(), path, classification, ...(demo ? { demo: true } : {}) });
      const enforce: RequestHandler<Record<string, string>> = (request, response, next) => {
        const boundary = response.locals.accessBoundary as AccessBoundary | undefined;
        const effective = demo && boundary?.mode === 'demo' ? 'DEMO' : classification;
        const audit = boundary?.audit ?? defaultAudit;
        const record = (decision: 'ALLOW' | 'DENY', code: string) => {
          try { audit({ route: `${domain}:${method}:${path}`, classification: effective, decision, code, timestamp: new Date().toISOString() }); } catch { /* audit sink cannot expose request data or bypass denial */ }
        };
        try {
          if (!boundary) throw new AccessError('HOUSEHOLD_CONTEXT_UNAVAILABLE');
          if (boundary.mode !== getRuntimeAppMode()) throw new AccessError('HOUSEHOLD_CONTEXT_INVALID');
          if (boundary.mode === 'demo' && boundary.context !== undefined) throw new AccessError('DEMO_HOUSEHOLD_CROSSOVER');
          if (effective === 'HOUSEHOLD') {
            if (boundary.mode !== 'household') throw new AccessError('DEMO_HOUSEHOLD_CROSSOVER');
            assertHouseholdAccess(boundary.context);
          } else if (effective === 'DEMO' && boundary.mode !== 'demo') throw new AccessError('DEMO_HOUSEHOLD_CROSSOVER');
          assertions(request, boundary);
          // Identity assertions are transport metadata, never domain payload.
          if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
            const { householdId: _householdId, appMode: _appMode, ...body } = request.body;
            request.body = body;
          }
          const { householdId: _householdId, appMode: _appMode, ...query } = request.query;
          Object.defineProperty(request, 'query', { value: query, configurable: true });
          if (effective === 'HOUSEHOLD') withHouseholdAccess(boundary.context!, () => validateRouteMembers(domain, method.toUpperCase(), path, request.body));
          record('ALLOW', 'OK');
          const invoke = () => Promise.resolve((effective === 'DEMO' && demo ? demo : handler)(request, response, next)).catch(next);
          if (effective === 'HOUSEHOLD') withHouseholdAccess(boundary.context!, invoke);
          else void invoke();
        } catch (error) {
          if (error instanceof AccessError) { record('DENY', error.code); accessErrorResponse(error, response); }
          else next(error);
        }
      };
      classifiedHandlers.add(enforce);
      router[method](path, enforce);
    };
  }
  return result;
}

/** Independent startup check: raw/unclassified Express routes cannot bypass registration. */
export function assertClassifiedRoutes(app: { router: { stack: unknown[] } }): void {
  type Layer = { route?: { path: string; stack: { handle: Function }[] }; handle?: Function & { stack?: unknown[] } };
  const visit = (stack: unknown[]) => {
    for (const raw of stack) {
      const layer = raw as Layer;
      if (layer.route) {
        if (!layer.route.stack.every(item => classifiedHandlers.has(item.handle) || publicHandlers.has(item.handle))) throw new Error('UNCLASSIFIED_API_ROUTE');
      } else if (layer.handle?.stack) visit(layer.handle.stack);
      else if (!infrastructureHandlers.has(layer.handle as Function)) throw new Error('UNCLASSIFIED_API_MIDDLEWARE');
    }
  };
  visit(app.router.stack);
}
