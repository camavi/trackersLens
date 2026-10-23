const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
class McpRuntimeRuns {
 constructor({persistence,packages,execute,trace,review,standardNodes}){Object.assign(this,{persistence,packages,execute,trace,review,standardNodes});this.plans=new Map();this.active=new Map();this.closed=false;this.persistenceErrors=new Map();}
 async source(workspaceId,nodeId){
  const node=this.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:nodeId});
  if(!node||node.workspaceId!==workspaceId)throw new Error('Exact runtime node not found in this workspace.');
  if(require('../desktop/node-edit-plan.cjs').busy(node))throw new Error('Node is already active; stop existing execution first.');
  if(node.type==='devPreview'&&node.subtype==='preview'&&!(node.outputs||[]).length)return {node,reference:{nativeTemplate:'preview'},packageSummary:{nativeTemplate:'preview',execution:'local-display-only'},fingerprint:hash(node)};
  const templateId=require('../runtime/standard-node-templates.js').kindOf(node);
  if(templateId){
   const runtime=await this.standardNodes.load({templateId,nodeId,workspaceId});
   return {node,reference:{templateId},packageSummary:{declaredPermissions:runtime.packageRecord.permissions,grantedPermissions:runtime.packageRecord.grantedPermissions,execution:runtime.packageRecord.manifest.execution||{},standardTemplate:templateId},fingerprint:hash({node,source:runtime.source,execution:runtime.packageRecord.manifest.execution})};
  }
  const ref=node.metadata?.customPackage;
  if(ref?.runtimeExecution!=='sandboxed')throw new Error('MCP execution currently supports installed sandboxed Custom Nodes only.');
  const runtime=await this.packages.loadSandboxRuntime({packageId:ref.packageId,version:ref.version,archiveSha256:ref.archive?.sha256});
  return {node,packageSummary:{declaredPermissions:runtime.packageRecord.permissions||runtime.packageRecord.manifest?.permissions||{},grantedPermissions:runtime.packageRecord.grantedPermissions||{},runtime:runtime.packageRecord.manifest?.runtime||{},execution:runtime.packageRecord.manifest?.execution||{}},reference:{packageId:ref.packageId,version:ref.version,archiveSha256:ref.archive?.sha256},fingerprint:hash({node,package:runtime.packageRecord,source:runtime.source})};
 }
 async preview(args,owner){
  if(this.closed)throw new Error('Runtime service closed.');
  const source=await this.source(args.workspaceId,args.nodeId);if(source.reference.nativeTemplate)throw new Error('Preview is a display sink; execute its producer instead.');const planId=crypto.randomUUID();
  const plan={...source,workspaceId:args.workspaceId,nodeId:args.nodeId,inputs:structuredClone(args.inputs),owner};this.plans.set(planId,plan);
  return {planId,workspaceId:args.workspaceId,nodeId:args.nodeId,node:source.node,reference:source.reference,package:source.packageSummary,inputs:plan.inputs,limitations:['One-shot execution in the existing TL Custom Node sandbox. Outputs are retained in the run report; no downstream graph propagation is implied. Local TL approval required.']};
 }
 async flowSource(workspaceId,startNodeId){
  const read=storeName=>this.persistence.readDevelopmentRecords({storeName,workspaceId});
  const graph={nodes:read('tl_runtime_nodes'),dependencies:read('tl_runtime_dependencies'),connections:read('tl_connections')};
  const chain=require('../runtime/sandbox-flow-plan.cjs').planSandboxChain({...graph,workspaceId,startNodeId});
  const sources=[];for(const step of chain.steps)sources.push(await this.source(workspaceId,step.nodeId));
  return {chain,sources,fingerprint:hash({graph,sources:sources.map(source=>source.fingerprint)})};
 }
 async previewFlow(args,owner){
  const material=await this.flowSource(args.workspaceId,args.startNodeId),planId=crypto.randomUUID();
  const plan={...material,kind:'flow',owner,workspaceId:args.workspaceId,nodeId:args.startNodeId,inputs:structuredClone(args.inputs)};this.plans.set(planId,plan);
  return {planId,chain:plan.chain,nodes:plan.sources.map(source=>({node:source.node,reference:source.reference,package:source.packageSummary})),inputs:plan.inputs,limitations:['Installed sandbox-node tree with sequential fan-out; joins/cycles are unsupported. Exact emitted ports and TL RuntimeContract mapping propagate payloads. Failed branches stop their descendants while independent queued branches continue; all evidence is preserved. Execution is isolated from the renderer event-bus subscribers to avoid duplicate dispatch.']};
 }
 save(run){this.persistence.writeDevelopmentRecords({storeName:'tl_ai_jobs',records:[run]});}
 async start({planId},owner){
  const plan=this.plans.get(planId);if(!plan||plan.owner!==owner||this.closed)throw new Error('Execution plan outside this MCP connection.');
  if(plan.used)throw new Error('Execution plan already consumed; inspect runId '+plan.runId+' instead of replaying.');
  plan.used=true;const runId='mcp_run_'+crypto.randomUUID();plan.runId=runId;
  const controller=new AbortController(),entry={owner,controller,run:null,pending:null};this.active.set(runId,entry);
  try{
   if(!await this.review({kind:'runtime-start',workspaceId:plan.workspaceId,operationId:runId,edits:[{operation:plan.kind==='flow'?'run-flow-chain':'run-node',nodeId:plan.nodeId,inputs:plan.inputs}],plan:{before:plan.kind==='flow'?plan.sources.map(source=>source.node):plan.node,after:plan.kind==='flow'?{chain:plan.chain,nodes:plan.sources.map(source=>({reference:source.reference,package:source.packageSummary})),inputs:plan.inputs}:{reference:plan.reference,package:plan.packageSummary,inputs:plan.inputs}}},controller.signal))return {status:'denied',runId};
   if(controller.signal.aborted||this.closed)throw new Error('MCP execution cancelled before start.');
   const fresh=plan.kind==='flow'?await this.flowSource(plan.workspaceId,plan.nodeId):await this.source(plan.workspaceId,plan.nodeId);if(controller.signal.aborted)throw new Error('MCP connection closed during source validation.');if(fresh.fingerprint!==plan.fingerprint)throw new Error('Node/package changed; prepare and review again.');
   if([...this.active.values()].some(other=>other!==entry&&other.run?.workspaceId===plan.workspaceId&&(plan.kind==='flow'||other.run?.kind==='mcp-flow-run'||other.run?.nodeId===plan.nodeId)))throw new Error('This node already has an MCP execution.');
   const run={id:runId,kind:plan.kind==='flow'?'mcp-flow-run':'mcp-node-run',workspaceId:plan.workspaceId,nodeId:plan.nodeId,status:'running',reference:plan.reference,inputs:plan.inputs,startedAt:new Date().toISOString(),executionId:'',result:null,error:null,...(plan.kind==='flow'?{chain:plan.chain,steps:[],deliveries:[]}:{} )};entry.run=run;this.save(run);
   entry.pending=(plan.kind==='flow'?this.performFlow(entry,plan):this.perform(entry,plan)).catch(error=>this.persistenceErrors.set(runId,error.message)).finally(()=>this.active.delete(runId));return {runId,status:'running',workspaceId:plan.workspaceId,nodeId:plan.nodeId};
  }finally{if(!entry.pending)this.active.delete(runId);}
 }
 recordFlowEvents(run,step,events,incremental=false){
  const eligible=events.filter(e=>['emit','log'].includes(e.kind));
  for(let index=incremental?(step.persistedRuntimeEvents||0):0;index<eligible.length;index++){
   const event=eligible[index];
   const storeName=event.kind==='log'?'tl_flow_logs':'tl_events',id=(run.kind==='mcp-flow-run'?'mcp_flow_event_':'mcp_node_event_')+run.id+'_'+(step.index??'node')+'_'+index;
   const previous=this.persistence.readDevelopmentRecordById({storeName,id});
   this.persistence.writeDevelopmentRecords({storeName,records:[{id,workspaceId:run.workspaceId,nodeId:step.nodeId,sourceNodeId:step.nodeId,runId:run.id,channel:event.port||'',eventType:(run.kind==='mcp-flow-run'?'mcp_flow_':'mcp_node_')+event.kind,status:step.status,payload:event.data,message:event.message||'',createdAt:previous?.createdAt||new Date().toISOString(),meta:{runId:run.id,executionId:step.executionId,mcpFlow:run.kind==='mcp-flow-run'}}]});
  }
  step.persistedRuntimeEvents=eligible.length;
 }
 checkpoint(entry,target,trace){
  try{target.trace=trace;this.recordFlowEvents(entry.run,target,trace.events||[],true);this.save(entry.run);}
  catch(error){entry.persistenceFailure=error.message;this.persistenceErrors.set(entry.run.id,error.message);entry.controller.abort();}
 }
 finishPersistence(entry){if(entry.persistenceFailure){entry.run.status='failed';entry.run.error={code:'MCP_RUNTIME_PERSISTENCE_FAILED',message:entry.persistenceFailure};}}
 async perform(entry,plan){
  const run=entry.run;
  try{run.result=await this.execute({...plan.reference,nodeId:plan.nodeId,inputs:plan.inputs,config:plan.node.metadata?.config||{},context:{workspaceId:plan.workspaceId,runId:run.id}}, {signal:entry.controller.signal,onExecution:id=>{run.executionId=id;this.save(run);},onEvent:(_event,trace)=>this.checkpoint(entry,run,trace)});run.status=entry.controller.signal.aborted?'cancelled':run.result.status==='success'?'completed':'failed';}
  catch(error){run.status=entry.controller.signal.aborted?'cancelled':'failed';run.error={message:error.message,code:error.code||'MCP_NODE_RUN_FAILED'};}
  finally{try{this.recordFlowEvents(run,run,run.result?.events||run.trace?.events||[]);}catch(error){entry.persistenceFailure=error.message;this.persistenceErrors.set(run.id,error.message);}this.finishPersistence(entry);if(run.executionId)run.trace=this.trace(run.executionId);run.completedAt=new Date().toISOString();run.durationMs=Date.parse(run.completedAt)-Date.parse(run.startedAt);this.save(run);}
 }
 async performFlow(entry,plan){
  const run=entry.run,{applyConnectionMapping}=require('../runtime/runtime-contract.js').TrackerLensRuntimeContract;
  const pending=[{nodeId:plan.nodeId,inputs:plan.inputs}],failures=[];
  try{
   while(pending.length){
    const {nodeId,inputs,fromStep}=pending.shift(),descriptor=plan.chain.steps.find(step=>step.nodeId===nodeId),source=plan.sources.find(item=>item.node.id===nodeId);
    if(entry.controller.signal.aborted)throw new Error('Flow cancelled.');
    const fresh=await this.flowSource(plan.workspaceId,plan.nodeId);if(fresh.fingerprint!==plan.fingerprint)throw new Error('Flow topology/node/package changed during execution; no further node was launched.');
    if(entry.controller.signal.aborted)throw new Error('Flow cancelled during validation.');
    const step={index:run.steps.length,nodeId:descriptor.nodeId,reference:source.reference,config:source.node.metadata?.config||{},inputs,fromStep,startedAt:new Date().toISOString(),status:'running',executionId:''};run.steps.push(step);this.save(run);
    try{
     step.result=source.reference.nativeTemplate==='preview'?{status:'success',events:[],display:{inputPort:'raw',sourceStep:fromStep}}:await this.execute({...source.reference,nodeId:source.node.id,inputs,config:source.node.metadata?.config||{},context:{workspaceId:plan.workspaceId,runId:run.id,flowId:plan.workspaceId}}, {signal:entry.controller.signal,onExecution:id=>{step.executionId=id;run.executionId=id;this.save(run);},onEvent:(_event,trace)=>this.checkpoint(entry,step,trace)});
     step.status=entry.controller.signal.aborted?'cancelled':step.result.status==='success'?'completed':'failed';
    }catch(error){step.status=entry.controller.signal.aborted?'cancelled':'failed';step.error={message:error.message,code:error.code||'FLOW_NODE_FAILED'};}
    finally{step.trace=step.executionId?this.trace(step.executionId):null;step.completedAt=new Date().toISOString();step.durationMs=Date.parse(step.completedAt)-Date.parse(step.startedAt);this.save(run);}
    this.recordFlowEvents(run,step,step.result?.events||[]);
    if(entry.controller.signal.aborted)throw new Error('Flow cancelled.');
    if(step.status!=='completed'){failures.push({step:step.index,nodeId:step.nodeId,error:step.error||null,diagnostics:step.result?.diagnostics||[]});continue;}
    for(const event of step.result.events||[])for(const link of descriptor.links)if(event.kind==='emit'&&event.port===link.sourcePort){
     const mapped=applyConnectionMapping(event.data,link.mapping),targetInputs={[link.targetPort]:mapped.payload};
     run.deliveries.push({fromStep:step.index,sourceNodeId:step.nodeId,...link,payload:event.data,mappingResult:mapped,inputs:targetInputs});pending.push({nodeId:link.targetNodeId,inputs:targetInputs,fromStep:step.index});
    }
   }
   const leaves=plan.chain.steps.filter(step=>!step.links.length).map(step=>step.nodeId);
   run.status=failures.length?'failed':'completed';run.result={terminalSteps:run.steps.filter(step=>leaves.includes(step.nodeId)),propagated:run.deliveries.length,failures,attention:leaves.filter(id=>!run.steps.some(step=>step.nodeId===id)).map(nodeId=>({nodeId,message:'No execution reached this terminal node. Inspect retained upstream outputs and failures.'}))};
   if(failures.length)run.error={message:'Flow branch execution failed; independent branches were allowed to complete. Inspect every step diagnostic.',code:'MCP_FLOW_FAILED'};
  }catch(error){run.status=entry.controller.signal.aborted?'cancelled':'failed';run.error={message:error.message,code:entry.controller.signal.aborted?'EXECUTION_CANCELLED':'MCP_FLOW_FAILED'};}
  finally{this.finishPersistence(entry);run.completedAt=new Date().toISOString();run.durationMs=Date.parse(run.completedAt)-Date.parse(run.startedAt);this.save(run);}
 }
 get({runId}){
  const run=this.persistence.readDevelopmentRecordById({storeName:'tl_ai_jobs',id:runId});if(!['mcp-node-run','mcp-flow-run'].includes(run?.kind))throw new Error('MCP runtime run not found.');
  const live=this.active.get(runId),interrupted=run.status==='running'&&!live;return {run:{...run,...(interrupted?{status:'interrupted',outcome:'unknown-after-restart',...(run.steps?{steps:run.steps.map(step=>step.status==='running'?{...step,status:'interrupted',outcome:'unknown-after-restart'}:step)}:{})}:{})},trace:live&&run.executionId?this.trace(run.executionId):run.trace||run.steps?.at(-1)?.trace||null,persistenceError:this.persistenceErrors.get(runId)||null,limitations:[run.kind==='mcp-flow-run'?'Sequential sandbox tree execution; no joins/cycles or general renderer event-bus dispatch.':'Single-node sandbox execution; no downstream Flow execution.','A historical interrupted run is never automatically replayed.']};
 }
 async stop({runId},owner){
  const entry=this.active.get(runId);if(!entry)return {...this.get({runId}),stopped:false};
  if(entry.owner!==owner)throw new Error('Only the owning MCP connection can stop this run.');
  entry.controller.abort();await entry.pending;return {...this.get({runId}),stopped:true};
 }
 forget(owner){for(const [id,plan]of this.plans)if(plan.owner===owner)this.plans.delete(id);for(const entry of this.active.values())if(entry.owner===owner)entry.controller.abort();}
 async close(){this.plans.clear();for(const entry of this.active.values())entry.controller.abort();await Promise.all([...this.active.values()].map(entry=>entry.pending));}
}
module.exports={McpRuntimeRuns};
