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
}
