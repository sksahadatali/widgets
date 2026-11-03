import type { ContextRequest, SourceClass } from './contextContract.js';
import type { FamilyMemory } from '../knowledge/familyMemorySchema.js';
import { canonicalMemoryValue } from '../knowledge/familyMemorySchema.js';

export const PROFILE_LIMIT = 4;
export const MEMORY_LIMIT = 8;
export const GRAPH_LIMIT = 12;
export const HARD_RESPONSE_BYTES = 65536;
export function purposeSources(purpose: ContextRequest['purpose']): SourceClass[] {
  return purpose==='MEAL_PREFERENCES'?['IDENTITY','FAMILY_MEMORY']:purpose==='CLOTHING_SHOPPING'?['IDENTITY','PROFILE','FAMILY_MEMORY']:['IDENTITY','FAMILY_GRAPH'];
}
export function memoryRelevant(m: FamilyMemory, request: ContextRequest): boolean {
  if(request.purpose==='FAMILY_RELATIONSHIPS')return false;
  const sameSubject=canonicalMemoryValue(m.subject)===canonicalMemoryValue(request.subject);
  if(!sameSubject&&!(request.options.includeHouseholdDefaults&&m.subject.kind==='HOUSEHOLD'))return false;
  if(m.context!==null && (request.applicability===null||canonicalMemoryValue(m.context)!==canonicalMemoryValue(request.applicability)))return false;
  if(request.purpose==='MEAL_PREFERENCES') {
    if(m.assertion.domain!=='FOOD'||!['PREFERENCE','CONVENTION','DECISION','CONSTRAINT','PATTERN'].includes(m.type))return false;
    if(m.type==='PATTERN'&&(m.assertion.value.topic!=='FOOD_CHOICE'||m.assertion.value.interpretation!=='TENDENCY_ONLY'))return false;
    return m.sensitivity==='STANDARD'||m.type==='CONSTRAINT';
  }
  return m.sensitivity==='STANDARD'&&m.assertion.domain==='SHOPPING'&&(m.type==='PREFERENCE'||m.type==='CONSTRAINT')&&m.assertion.value.topic===request.options.garment;
}
