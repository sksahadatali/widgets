import { getHouseholdConfig, resolveCanonicalMember } from '../config/householdConfig.js';
import { AccessError, requireHouseholdAccess } from './householdAccess.js';

export function validateMemberContext(value: unknown, options: { family?: boolean; historical?: boolean; nullable?: boolean } = {}): void {
  requireHouseholdAccess();
  if (value === null && options.nullable) return;
  if (value === 'family' && options.family) return;
  if (typeof value !== 'string' || value !== value.trim()) throw new AccessError('INVALID_MEMBER_CONTEXT');
  const member = resolveCanonicalMember(value, getHouseholdConfig());
  if (!member || (!options.historical && member.lifecycle !== 'ACTIVE')) throw new AccessError('INVALID_MEMBER_CONTEXT');
}
/** Validate only defined domain input positions; never scan arbitrary text/history. */
export function validateRouteMembers(domain: string, method: string, path: string, raw: unknown): void {
  if (method === 'GET' || method === 'HEAD' || !raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const body = raw as Record<string, unknown>;
  const check = (key: string, options: Parameters<typeof validateMemberContext>[1] = {}) => {
    if (Object.hasOwn(body, key)) validateMemberContext(body[key], options);
  };
  if (domain === 'calendar' && path.startsWith('/profile-assignments/') && method === 'PUT') {
    const target = body.target as { kind?: unknown; profileIds?: unknown } | undefined;
    if (target?.kind === 'members' && Array.isArray(target.profileIds)) target.profileIds.forEach(id => validateMemberContext(id));
  }
  if (domain === 'routines' && (path === '/' || path === '/:id')) {
    check('ownerProfileId', { family: true });
    const reward = body.reward as { recipientProfileId?: unknown } | undefined;
    if (reward) validateMemberContext(reward.recipientProfileId);
  }
  if (domain === 'rewards') { check('profileId'); check('actorProfileId', { nullable: true }); }
  if (domain === 'redemptions') { check('profileId'); check('requestedByProfileId'); check('actorProfileId'); }
  if (domain === 'lists') check('addedByProfileId', { family: true });
  if (domain === 'kumon') check('childProfileId');
  if (domain === 'family-knowledge') {
    if (path === '/graph/query') check('memberId', { historical: true });
    const subject = body.subject as { kind?: unknown; memberId?: unknown } | undefined;
    if (path === '/profiles' && subject?.kind === 'MEMBER') validateMemberContext(subject.memberId, { historical: true });
    const relation = body.relationship as { fromMemberId?: unknown; toMemberId?: unknown; provenance?: unknown } | undefined;
    if (path === '/relationships' && relation) {
      validateMemberContext(relation.fromMemberId, { historical: true });
      validateMemberContext(relation.toMemberId, { historical: true });
    }
    const provenance = ((body.fact as { provenance?: unknown } | undefined)?.provenance ?? relation?.provenance) as { suppliedByMemberId?: unknown } | undefined;
    if (provenance && provenance.suppliedByMemberId !== null) validateMemberContext(provenance.suppliedByMemberId);
    const memory = body.memory as { subject?: {kind?:unknown;memberId?:unknown}; provenance?: {suppliedByMemberId?:unknown} } | undefined;
    const memorySubject = path === '/memories/query' ? body.subject as {kind?:unknown;memberId?:unknown} | undefined : memory?.subject;
    if (memorySubject?.kind === 'MEMBER') validateMemberContext(memorySubject.memberId, { historical: true });
    if (memory?.provenance && memory.provenance.suppliedByMemberId !== null) validateMemberContext(memory.provenance.suppliedByMemberId);

  }

}
