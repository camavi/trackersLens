const crypto=require('node:crypto');
class McpNodeEdits {
 constructor({core,persistence,review,withEditorPaused}){this.core=core;this.persistence=persistence;this.review=review;this.withEditorPaused=withEditorPaused;this.plans=new Map();this.running=false;this.closed=false;this.controllers=new Map();}
 async preview(args,owner){
  if(this.closed)throw new Error('MCP editor is closed.');
  const plan=await this.core.request('desktop.flowChat.applyNodeEdits',{workspaceId:args.workspaceId,edits:args.edits,confirmed:false});
  const planId=crypto.randomUUID(),operationId='mcp_'+crypto.randomUUID();
  this.plans.set(planId,{owner,workspaceId:args.workspaceId,edits:structuredClone(args.edits),expected:plan.before,operationId,plan});
  return {...plan,planId,operationId,tool:'applyNodeEdits',status:'ready',limitations:['Apply requires a separate call and local TL review. TL saves pending edits and reloads the editor; stale state or active runtime work blocks the entire write.']};
 }
 async apply({planId},owner){
  const plan=this.plans.get(planId);if(!plan||plan.owner!==owner)throw new Error('Plan is outside this MCP connection; prepare a new preview.');
  if(this.running||this.closed)throw new Error('Another MCP edit or project transition is in progress.');
  this.running=true;const controller=new AbortController();this.controllers.set(owner,controller);
  try{
   const prior=this.persistence.getNodeEditReceipt({workspaceId:plan.workspaceId,operationId:plan.operationId});
   if(prior)return {...prior,replayed:true,reconciliation:'Check the current TL editor state; no mutation was repeated.'};
   if(!this.review||!this.withEditorPaused)throw new Error('TL editor approval/reconciliation is unavailable.');
   if(!await this.review({...plan,planId},controller.signal))return {applied:false,status:'denied',operationId:plan.operationId};
   if(this.closed||!this.plans.has(planId))throw new Error('MCP connection closed before application.');
   return await this.withEditorPaused(async()=>{
    if(this.closed||!this.plans.has(planId))throw new Error('MCP connection closed before application.');
    return this.core.request('desktop.flowChat.applyNodeEdits',{workspaceId:plan.workspaceId,edits:plan.edits,expected:plan.expected,operationId:plan.operationId,confirmed:true});
   });
  }finally{this.controllers.delete(owner);this.running=false;}
 }
 receipt({workspaceId,operationId}){if(!/^mcp_[a-f0-9-]+$/.test(operationId))throw new Error('Expected an MCP operationId returned by preview.');return {receipt:this.persistence.getNodeEditReceipt({workspaceId,operationId}),limitations:['A receipt proves a committed Core mutation, not successful renderer reload. Absence does not authorize automatic replay; request a fresh preview.']};}
 forget(owner){this.controllers.get(owner)?.abort();for(const [id,plan] of this.plans)if(plan.owner===owner)this.plans.delete(id);}
 close(){this.closed=true;this.plans.clear();}
}
module.exports={McpNodeEdits};
