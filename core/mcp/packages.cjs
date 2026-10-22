const crypto=require('node:crypto');
// MCP owns connection/review tokens; existing Core setup/migration owns effects.
class McpPackages {
 constructor({core,persistence,review,withEditorPaused,discardDraft}){Object.assign(this,{core,persistence,review,withEditorPaused,discardDraft});this.plans=new Map();this.pending=new Set();this.inflight=new Set();this.cleanupErrors=[];this.nextOwner=-1;this.generation=0;this.forgotten=new WeakSet();}
 track(pending){this.pending.add(pending);return pending.finally(()=>this.pending.delete(pending));}
 check(owner,generation){if(this.forgotten.has(owner)||generation!==this.generation)throw new Error('MCP package connection closed.');}
 previewDraft(args,owner){return this.track(this.prepareDraft(args,owner));}
 async prepareDraft(args,owner){
  const generation=this.generation;this.check(owner,generation);
  const draft=await this.core.request('desktop.customNodePackages.prepareCreate',args),ownerId=this.nextOwner--;
  let setup;
  try{
   this.check(owner,generation);
   setup=await this.core.request('desktop.customNodePackages.previewSetup',{importId:draft.importId},{ownerId});
   this.check(owner,generation);
   if(!setup.planId){await this.discardDraft?.(draft.importId);return {...setup,source:args.source};}
   const planId=crypto.randomUUID(),operationId='mcp_package_'+crypto.randomUUID();
   this.plans.set(planId,{owner,ownerId,operationId,kind:'setup',innerId:setup.planId,importId:draft.importId,material:{...setup,source:args.source}});
   return {...setup,operationId,planId,source:args.source,limitations:[...setup.limitations,'Draft only. Separate local TL approval covers exact source, permissions, managed dependencies and activation. No node is inserted or executed.']};
  }catch(error){if(setup?.planId)await this.core.request('desktop.customNodePackages.discardSetup',{planId:setup.planId},{ownerId});await this.discardDraft?.(draft.importId);throw error;}
 }
 previewMigration(args,owner){return this.track(this.prepareMigration(args,owner));}
 async prepareMigration(args,owner){
  const generation=this.generation;this.check(owner,generation);
  const material=await this.core.request('desktop.customNodePackages.previewMigration',args),planId=crypto.randomUUID(),operationId='mcp_package_'+crypto.randomUUID();
  try{this.check(owner,generation);}catch(error){await this.core.request('desktop.customNodePackages.discardMigration',{planId:material.planId});throw error;}
  this.plans.set(planId,{owner,operationId,kind:'migration',innerId:material.planId,workspaceId:args.workspaceId,material});
  return {...material,planId,operationId};
 }
 apply(args,owner){return this.track(this.perform(args,owner));}
 async perform({planId},owner){
  const plan=this.plans.get(planId);if(!plan||plan.owner!==owner)throw new Error('Package plan outside this connection.');
  if(plan.used)throw new Error('Package plan consumed; inspect operationId '+plan.operationId+' without replay.');plan.used=true;
  const controller=new AbortController();plan.controller=controller;
  const job={id:plan.operationId,kind:'mcp-package-operation',workspaceId:plan.workspaceId||'',status:'reviewing',operation:plan.kind,plan:plan.material,startedAt:new Date().toISOString()};
  const save=()=>this.persistence.writeDevelopmentRecords({storeName:'tl_ai_jobs',records:[job]});this.inflight.add(job.id);
  try{
   save();
   if(!await this.review({kind:'package',workspaceId:plan.workspaceId||'project',operationId:plan.operationId,edits:[{operation:plan.kind}],plan:{before:plan.material.before||plan.material.nodes||null,after:plan.material}},controller.signal)){job.status='denied';return {operationId:job.id,status:'denied'};}
   if(controller.signal.aborted)throw new Error('Package connection closed before application.');
   return await this.withEditorPaused(async()=>{
    if(controller.signal.aborted)throw new Error('Package connection closed before application.');
    job.status='running';save();
    job.result=await this.core.request(plan.kind==='setup'?'desktop.customNodePackages.executeSetup':'desktop.customNodePackages.applyMigration',{planId:plan.innerId,confirmed:true},{ownerId:plan.ownerId});
    job.status=job.result.ok===false?job.result.status:'completed';save();return {operationId:job.id,status:job.status,...job.result};
   });
  }catch(error){job.status=job.result?'committed-reload-failed':'failed';job.error={message:error.message,code:error.code||'MCP_PACKAGE_FAILED'};throw error;}
  finally{job.completedAt=new Date().toISOString();try{save();}finally{this.inflight.delete(job.id);await this.cleanup(plan);}}
 }
 get({operationId}){const operation=this.persistence.readDevelopmentRecordById({storeName:'tl_ai_jobs',id:operationId});if(operation?.kind!=='mcp-package-operation')throw new Error('Package operation not found.');return {operation:{...operation,...(['reviewing','running'].includes(operation.status)&&!this.inflight.has(operationId)?{status:'interrupted',outcome:'unknown-after-restart'}:{})},cleanupErrors:this.cleanupErrors,limitations:['Inspect setupJobId/snapshotId and result before any new proposal. No automatic replay. Approved setup stages already in progress finish before service shutdown; they are not rolled back on disconnect.']};}
 async cleanup(plan){if(plan.kind==='setup'){await this.core.request('desktop.customNodePackages.discardSetup',{planId:plan.innerId},{ownerId:plan.ownerId});await this.discardDraft?.(plan.importId);}else await this.core.request('desktop.customNodePackages.discardMigration',{planId:plan.innerId});}
 forget(owner){this.forgotten.add(owner);for(const [id,plan]of this.plans)if(plan.owner===owner){plan.controller?.abort();this.plans.delete(id);if(!plan.used){const pending=this.cleanup(plan).catch(error=>this.cleanupErrors.push({operationId:plan.operationId,message:error.message}));this.pending.add(pending);void pending.finally(()=>this.pending.delete(pending));}}}
 async close(){this.generation++;for(const plan of this.plans.values()){plan.controller?.abort();if(!plan.used)await this.cleanup(plan);}this.plans.clear();await Promise.allSettled([...this.pending]);}
}
module.exports={McpPackages};
