const crypto=require('node:crypto');
class McpNodeEdits {
 constructor({core,persistence,review,withEditorPaused,packages,standardNodes}){this.standardNodes=standardNodes;this.packages=packages;this.core=core;this.persistence=persistence;this.review=review;this.withEditorPaused=withEditorPaused;this.plans=new Map();this.forgotten=new WeakSet();this.running=false;this.closed=false;this.controllers=new Map();}
 async preview(args,owner){
  if(this.closed||this.forgotten.has(owner))throw new Error('MCP editor is closed.');
  const plan=await this.core.request('desktop.flowChat.applyNodeEdits',{workspaceId:args.workspaceId,edits:args.edits,confirmed:false});
  if(this.closed||this.forgotten.has(owner))throw new Error('MCP connection closed during preview.');
  const planId=crypto.randomUUID(),operationId='mcp_'+crypto.randomUUID();
  this.plans.set(planId,{owner,workspaceId:args.workspaceId,edits:structuredClone(args.edits),expected:plan.before,operationId,plan});
  return {...plan,planId,operationId,tool:'applyNodeEdits',status:'ready',limitations:['Apply requires a separate call and local TL review. TL saves pending edits and reloads the editor; stale state or active runtime work blocks the entire write.']};
 }
 async previewStandard(args,owner){
  const node=this.standardNodes.buildNode({...args,id:'mcp_node_'+crypto.randomUUID()});
  const result=await this.preview({workspaceId:args.workspaceId,edits:[{operation:'create',node}]},owner);
  return {...result,nodeId:node.id,templateId:args.templateId};
 }
 async previewInstalled(args,owner){
  const {packageRecord:pkg}=await this.packages.loadSandboxRuntime(args.reference),manifest=pkg.manifest;
  const config=require('../desktop/custom-node-settings.cjs').resolveSettings(manifest.settingsSchema||{},args.config||{});
  const node={id:'mcp_node_'+crypto.randomUUID(),workspaceId:args.workspaceId,type:'custom',subtype:manifest.subtype,label:args.label,inputs:manifest.inputs||[],outputs:manifest.outputs||[],channels:[...new Set([...(manifest.inputs||[]),...(manifest.outputs||[])])],flowPosition:args.position||{x:0,y:0},metadata:{paletteLabel:manifest.name,runtimeType:'custom',subtype:manifest.subtype,category:manifest.category,configured:true,configRules:manifest.configRules||[],generatedBy:'mcp-installed-package',manifest,settingsSchema:manifest.settingsSchema||{},config,customPackage:{packageId:pkg.packageId,version:pkg.version,archive:pkg.archive,runtimeExecution:pkg.runtimeExecution,installState:pkg.installState},runtimeBlocked:false}};
  const result=await this.preview({workspaceId:args.workspaceId,edits:[{operation:'create',node}]},owner);
  Object.assign(this.plans.get(result.planId),{packageReference:structuredClone(args.reference),packageRecord:structuredClone(pkg)});return {...result,nodeId:node.id};
 }
 async previewGraph(args,owner){
  const edits=args.edits.map(edit=>{
   if(edit.operation==='connect')return {...edit,dependencyId:'mcp_dep_'+crypto.randomUUID(),connectionId:'mcp_conn_'+crypto.randomUUID()};
   if(edit.operation==='duplicate')return {...edit,newNodeId:'mcp_node_'+crypto.randomUUID()};
   return {...edit};
  });
  const result=await this.preview({...args,edits},owner);
  return {...result,edits,limitations:[...result.limitations,'New identities are allocated once by TL for this exact plan. Duplicate creates an inactive instance from the existing node; existing channel producers and saved output are preserved. Disconnect removes only the exact link; it does not delete produced data.']};
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
    if(plan.packageReference){const fresh=await this.packages.loadSandboxRuntime(plan.packageReference);if(!require('node:util').isDeepStrictEqual(fresh.packageRecord,plan.packageRecord))throw new Error('Package consent/catalog changed; prepare a new preview.');}
    if(this.closed||!this.plans.has(planId))throw new Error('MCP connection closed during package validation.');
    return this.core.request('desktop.flowChat.applyNodeEdits',{workspaceId:plan.workspaceId,edits:plan.edits,expected:plan.expected,operationId:plan.operationId,confirmed:true});
   });
  }finally{this.controllers.delete(owner);this.running=false;}
 }
 receipt({workspaceId,operationId}){if(!/^mcp_[a-f0-9-]+$/.test(operationId))throw new Error('Expected an MCP operationId returned by preview.');return {receipt:this.persistence.getNodeEditReceipt({workspaceId,operationId}),limitations:['A receipt proves a committed Core mutation, not successful renderer reload. Absence does not authorize automatic replay; request a fresh preview.']};}
 forget(owner){this.forgotten.add(owner);this.controllers.get(owner)?.abort();for(const [id,plan] of this.plans)if(plan.owner===owner)this.plans.delete(id);}
 close(){this.closed=true;this.plans.clear();}
}
module.exports={McpNodeEdits};
