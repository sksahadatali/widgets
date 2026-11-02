import type { HouseholdConfig } from '../config/householdConfig.js';
import { KnowledgeError, record, validateSubject, RELATIONSHIP_TYPES, type KnowledgeV2, type Relationship } from './familyKnowledgeSchema.js';
export type GraphQuery = { memberId: string; relationshipTypes: Relationship['type'][]; direction: 'OUTGOING' | 'INCOMING' | 'BOTH'; depth: number; limit: number; includeRetracted: boolean };
export function validateGraphQuery(input: unknown, config: HouseholdConfig): GraphQuery {
  const v = record(input, ['memberId','relationshipTypes','direction','depth','limit','includeRetracted']);
  validateSubject({ kind: 'MEMBER', memberId: v.memberId }, config);
  if (!Array.isArray(v.relationshipTypes) || !v.relationshipTypes.length || v.relationshipTypes.length > 3 || new Set(v.relationshipTypes).size !== v.relationshipTypes.length || v.relationshipTypes.some(type => !RELATIONSHIP_TYPES.includes(type)) ||
    !['OUTGOING','INCOMING','BOTH'].includes(String(v.direction)) || !Number.isInteger(v.depth) || Number(v.depth) < 1 || Number(v.depth) > 3 || !Number.isInteger(v.limit) || Number(v.limit) < 1 || Number(v.limit) > 100 || typeof v.includeRetracted !== 'boolean') throw new KnowledgeError('INVALID_GRAPH_BOUNDS');
  return v as GraphQuery;
}
/** Pure bounded projection. Canonical membership is derived, never stored as an edge. */
export function queryGraph(store: Pick<KnowledgeV2, 'revision' | 'relationships'>, query: GraphQuery, config: HouseholdConfig) {
  query = validateGraphQuery(query, config);
  const visited = new Set([query.memberId]);
  let frontier = [query.memberId];
  const result = new Map<string, Relationship>();
  let truncated = false;
  for (let depth = 0; depth < query.depth && frontier.length; depth++) {
    const next: string[] = [];
    for (const node of frontier) for (const edge of store.relationships) {
      if (!query.relationshipTypes.includes(edge.type) || (!query.includeRetracted && edge.lifecycle !== 'ACTIVE')) continue;
      // Spouse is symmetric irrespective of input endpoint order.
      const outgoing = edge.type === 'SPOUSE_OF' || query.direction !== 'INCOMING';
      const incoming = edge.type === 'SPOUSE_OF' || query.direction !== 'OUTGOING';
      const neighbour = outgoing && edge.fromMemberId === node ? edge.toMemberId : incoming && edge.toMemberId === node ? edge.fromMemberId : null;
      if (!neighbour || result.has(edge.id)) continue;
      if (result.size >= query.limit || (!visited.has(neighbour) && visited.size >= 100)) { truncated = true; continue; }
      result.set(edge.id, edge);
      if (!visited.has(neighbour)) { visited.add(neighbour); next.push(neighbour); }
    }
    frontier = next;
  }
  // Depth is a deliberate traversal boundary; report remaining reachable unreturned edges.
  if (frontier.some(node => store.relationships.some(edge => !result.has(edge.id) && query.relationshipTypes.includes(edge.type) && (query.includeRetracted || edge.lifecycle === 'ACTIVE') &&
    ((edge.fromMemberId === node && (query.direction !== 'INCOMING' || edge.type === 'SPOUSE_OF')) || (edge.toMemberId === node && (query.direction !== 'OUTGOING' || edge.type === 'SPOUSE_OF')))))) truncated = true;
  return { revision: store.revision, relationships: [...result.values()], derivedMembership: [...visited].map(memberId => ({ type: 'MEMBER_OF_HOUSEHOLD' as const, householdId: config.household.householdId, memberId })), truncated };
}
