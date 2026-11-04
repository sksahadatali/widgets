import { AccessError, requireHouseholdAccess } from '../access/householdAccess.js';
import { getHouseholdConfig } from '../config/householdConfig.js';
import { familyKnowledgeStore } from '../knowledge/familyKnowledgeStore.js';
import { ContextError, validateContextRequest, type Purpose, type SourceSignal } from './contextContract.js';

export type ContextAudit = {
  purpose: Purpose | 'INVALID'; outcome: 'SUCCESS' | 'PARTIAL' | 'DENIED' | 'INVALID' | 'UNAVAILABLE' | 'CONFLICTED';
  sources: SourceSignal[]; durationMs: number;
};
const defaultAudit=(record:ContextAudit)=>console.info('EYOS_CONTEXT',JSON.stringify(record));
/** No cache, source callbacks or provider/tool execution. The runtime capability is mandatory. */
export async function retrieveContext(input:unknown, options:{now?:()=>Date;audit?:(record:ContextAudit)=>void}={}) {
  requireHouseholdAccess();
  const started=performance.now();
  let purpose:ContextAudit['purpose']='INVALID',outcome:ContextAudit['outcome']='INVALID',sources:SourceSignal[]=[];
  try {
    const config=getHouseholdConfig();
    const request=validateContextRequest(input,config);purpose=request.purpose;
    const asOf=(options.now??(()=>new Date()))().toISOString();
    const response=await familyKnowledgeStore.contextProjection(request,asOf);
    requireHouseholdAccess();
    sources=response.sources.map(source=>({source:source.source,states:[...source.states]}));
    outcome=response.completion==='PARTIAL'?'PARTIAL':'SUCCESS';
    return response;
  } catch(error) {
    if(error instanceof AccessError) {outcome='DENIED';throw error;}
    if(error instanceof ContextError) {
      outcome=error.status===409?'CONFLICTED':error.status===503?'UNAVAILABLE':'INVALID';sources=error.sources;throw error;
    }
    outcome='UNAVAILABLE';throw new ContextError('CONTEXT_UNAVAILABLE',503);
  } finally {
    // Audit failure neither leaks payloads nor changes access/retrieval outcome.
    try {(options.audit??defaultAudit)({purpose,outcome,sources,durationMs:Math.max(0,Math.round(performance.now()-started))});} catch { /* best-effort metadata only */ }
  }
}
