import { AccessError } from '../access/householdAccess.js';
import { classifiedRouter } from '../access/classifiedRouter.js';
import { KnowledgeError } from '../knowledge/familyKnowledgeSchema.js';
import { familyKnowledgeStore } from '../knowledge/familyKnowledgeStore.js';
import type { RequestHandler } from 'express';
const router = classifiedRouter('family-knowledge');
const handle = (operation: RequestHandler<Record<string,string>>): RequestHandler<Record<string,string>> => async (request, response, next) => {
  try { await operation(request, response, next); }
  catch (error) {
    if (error instanceof AccessError) { next(error); return; }
    if (error instanceof KnowledgeError) {
      response.status(error.status).json({ success: false, code: error.code, error: error.status >= 500 ? 'Family Knowledge is unavailable.' : 'Family Knowledge request could not be completed.' });
    } else {
      console.error('Family Knowledge operation failed.');
      response.status(503).json({ success: false, code: 'FAMILY_KNOWLEDGE_UNAVAILABLE', error: 'Family Knowledge is unavailable.' });
    }
  }
};
router.get('/profiles', 'HOUSEHOLD', handle(async (request,response) => { response.json(await familyKnowledgeStore.profile(request.query.memberId)); }));
router.post('/profiles', 'HOUSEHOLD', handle(async (request,response) => { response.status(201).json(await familyKnowledgeStore.createProfile(request.body)); }));
router.post('/profiles/:profileId/facts', 'HOUSEHOLD', handle(async (request,response) => { response.status(201).json(await familyKnowledgeStore.addFact(request.params.profileId, request.body)); }));
router.post('/profiles/:profileId/facts/:factId/supersede', 'HOUSEHOLD', handle(async (request,response) => { response.status(201).json(await familyKnowledgeStore.addFact(request.params.profileId, request.body, request.params.factId)); }));
router.post('/profiles/:profileId/facts/:factId/retract', 'HOUSEHOLD', handle(async (request,response) => { response.json(await familyKnowledgeStore.retractFact(request.params.profileId, request.params.factId, request.body)); }));
router.post('/relationships', 'HOUSEHOLD', handle(async (request,response) => { response.status(201).json(await familyKnowledgeStore.createRelationship(request.body)); }));
router.post('/relationships/:relationshipId/retract', 'HOUSEHOLD', handle(async (request,response) => { response.json(await familyKnowledgeStore.retractRelationship(request.params.relationshipId, request.body)); }));
router.post('/graph/query', 'HOUSEHOLD', handle(async (request,response) => { response.json(await familyKnowledgeStore.graph(request.body)); }));
router.post('/memories/query', 'HOUSEHOLD', handle(async (request,response) => { response.json(await familyKnowledgeStore.memories(request.body)); }));
router.get('/memories/:memoryId', 'HOUSEHOLD', handle(async (request,response) => { response.json(await familyKnowledgeStore.memory(request.params.memoryId)); }));
router.post('/memories', 'HOUSEHOLD', handle(async (request,response) => { response.status(201).json(await familyKnowledgeStore.createMemory(request.body)); }));
router.post('/memories/:memoryId/supersede', 'HOUSEHOLD', handle(async (request,response) => { response.status(201).json(await familyKnowledgeStore.createMemory(request.body, request.params.memoryId)); }));
router.post('/memories/:memoryId/retract', 'HOUSEHOLD', handle(async (request,response) => { response.json(await familyKnowledgeStore.endMemory(request.params.memoryId, request.body, 'RETRACTED')); }));
router.post('/memories/:memoryId/expire', 'HOUSEHOLD', handle(async (request,response) => { response.json(await familyKnowledgeStore.endMemory(request.params.memoryId, request.body, 'EXPIRED')); }));
export default router.router;
