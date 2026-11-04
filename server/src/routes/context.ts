import { classifiedRouter } from '../access/classifiedRouter.js';
import { AccessError } from '../access/householdAccess.js';
import { ContextError } from '../context/contextContract.js';
import { retrieveContext } from '../context/contextService.js';
const router=classifiedRouter('context');
router.post('/retrieve','HOUSEHOLD',async(request,response,next)=>{
  response.set('Cache-Control','no-store');
  try {response.json(await retrieveContext(request.body));}
  catch(error) {
    if(error instanceof AccessError) {next(error);return;}
    const failure=error instanceof ContextError?error:new ContextError('CONTEXT_UNAVAILABLE',503);
    response.status(failure.status).json({success:false,code:failure.code,error:failure.message,sources:failure.sources});
  }
});
export default router.router;
