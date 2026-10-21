const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
class McpRuntimeRuns {
 constructor({persistence,packages,execute,trace,review}){Object.assign(this,{persistence,packages,execute,trace,review});this.plans=new Map();this.active=new Map();this.closed=false;this.persistenceErrors=new Map();}
 async source(workspaceId,nodeId){
  const node=this.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:nodeId});
  if(!node||node.workspaceId!==workspaceId)throw new Error('Exact runtime node not found in this workspace.');
  if(require('../desktop/node-edit-plan.cjs').busy(node))throw new Error('Node is already active; stop existing execution first.');
  const ref=node.metadata?.customPackage;
  if(ref?.runtimeExecution!=='sandboxed')throw new Error('MCP execution currently supports installed sandboxed Custom Nodes only.');
  const runtime=await this.packages.loadSandboxRuntime({packageId:ref.packageId,version:ref.version,archiveSha256:ref.archive?.sha256});
  return {node,packageSummary:{declaredPermissions:runtime.packageRecord.permissions||runtime.packageRecord.manifest?.permissions||{},grantedPermissions:runtime.packageRecord.grantedPermissions||{},runtime:runtime.packageRecord.manifest?.runtime||{},execution:runtime.packageRecord.manifest?.execution||{}},reference:{packageId:ref.packageId,version:ref.version,archiveSha256:ref.archive?.sha256},fingerprint:hash({node,package:runtime.packageRecord,source:runtime.source})};
 }
 async preview(args,owner){
  if(this.closed)throw new Error('Runtime service closed.');
  const source=await this.source(args.workspaceId,args.nodeId),planId=crypto.randomUUID();
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
  return {planId,chain:plan.chain,nodes:plan.sources.map(source=>({node:source.node,reference:source.reference,package:source.packageSummary})),inputs:plan.inputs,limitations:['Linear installed sandbox-node chain only; no branch/join/cycle scheduling. Exact emitted ports and TL RuntimeContract mapping propagate payloads. Fail-fast preserves all produced evidence. Execution is isolated from the renderer event-bus subscribers to avoid duplicate dispatch.']};
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
 async perform(entry,plan){
  const run=entry.run;
  try{run.result=await this.execute({...plan.reference,nodeId:plan.nodeId,inputs:plan.inputs,config:plan.node.metadata?.config||{},context:{workspaceId:plan.workspaceId,runId:run.id}}, {signal:entry.controller.signal,onExecution:id=>{run.executionId=id;this.save(run);}});run.status=entry.controller.signal.aborted?'cancelled':run.result.status==='success'?'completed':'failed';}
  catch(error){run.status=entry.controller.signal.aborted?'cancelled':'failed';run.error={message:error.message,code:error.code||'MCP_NODE_RUN_FAILED'};}
  finally{if(run.executionId)run.trace=this.trace(run.executionId);run.completedAt=new Date().toISOString();run.durationMs=Date.parse(run.completedAt)-Date.parse(run.startedAt);this.save(run);}
 }
 async performFlow(entry,plan){
  const run=entry.run,{applyConnectionMapping}=require('../runtime/runtime-contract.js').TrackerLensRuntimeContract;
  let pending=[plan.inputs];
  try{
   for(let index=0;index<plan.chain.steps.length;index++){
    const descriptor=plan.chain.steps[index],source=plan.sources[index],next=[];
    for(const inputs of pending){
     if(entry.controller.signal.aborted)throw new Error('Flow cancelled.');
     const fresh=await this.flowSource(plan.workspaceId,plan.nodeId);if(fresh.fingerprint!==plan.fingerprint)throw new Error('Flow topology/node/package changed during execution; no further node was launched.');
     if(entry.controller.signal.aborted)throw new Error('Flow cancelled during validation.');
     const step={index:run.steps.length,nodeId:descriptor.nodeId,inputs,startedAt:new Date().toISOString(),status:'running',executionId:''};run.steps.push(step);this.save(run);
     try{
      step.result=await this.execute({...source.reference,nodeId:source.node.id,inputs,config:source.node.metadata?.config||{},context:{workspaceId:plan.workspaceId,runId:run.id,flowId:plan.workspaceId}}, {signal:entry.controller.signal,onExecution:id=>{step.executionId=id;run.executionId=id;this.save(run);}});
      step.status=entry.controller.signal.aborted?'cancelled':step.result.status==='success'?'completed':'failed';
     }catch(error){step.status=entry.controller.signal.aborted?'cancelled':'failed';step.error={message:error.message,code:error.code||'FLOW_NODE_FAILED'};}
     finally{step.trace=step.executionId?this.trace(step.executionId):null;step.completedAt=new Date().toISOString();step.durationMs=Date.parse(step.completedAt)-Date.parse(step.startedAt);this.save(run);}
     for(const event of step.result?.events||[]){
      const id='mcp_flow_event_'+crypto.randomUUID();
      this.persistence.writeDevelopmentRecords({storeName:event.kind==='log'?'tl_flow_logs':'tl_events',records:[{id,workspaceId:plan.workspaceId,nodeId:step.nodeId,sourceNodeId:step.nodeId,runId:run.id,channel:event.port||'',eventType:'mcp_flow_'+event.kind,status:step.status,payload:event.data,message:event.message||'',createdAt:new Date().toISOString(),meta:{runId:run.id,executionId:step.executionId,mcpFlow:true}}]});
     }
     if(step.status!=='completed')throw new Error('Flow stopped at node '+step.nodeId+'; inspect its complete diagnostics.');
     if(descriptor.link)for(const event of step.result.events||[])if(event.kind==='emit'&&event.port===descriptor.link.sourcePort){
      const mapped=applyConnectionMapping(event.data,descriptor.link.mapping),targetInputs={[descriptor.link.targetPort]:mapped.payload};
      run.deliveries.push({fromStep:step.index,sourceNodeId:step.nodeId,targetNodeId:plan.chain.steps[index+1].nodeId,...descriptor.link,payload:event.data,mappingResult:mapped,inputs:targetInputs});next.push(targetInputs);
     }
    }
    pending=next;
   }
   run.status='completed';run.result={terminalSteps:run.steps.filter(step=>step.nodeId===plan.chain.steps.at(-1).nodeId),propagated:run.deliveries.length,attention:run.steps.some(step=>step.nodeId===plan.chain.steps.at(-1).nodeId)?[]:['No matching emission reached the terminal node. Inspect retained producer outputs.']};
  }catch(error){run.status=entry.controller.signal.aborted?'cancelled':'failed';run.error={message:error.message,code:entry.controller.signal.aborted?'EXECUTION_CANCELLED':'MCP_FLOW_FAILED'};}
  finally{run.completedAt=new Date().toISOString();run.durationMs=Date.parse(run.completedAt)-Date.parse(run.startedAt);this.save(run);}
 }
 get({runId}){
  const run=this.persistence.readDevelopmentRecordById({storeName:'tl_ai_jobs',id:runId});if(!['mcp-node-run','mcp-flow-run'].includes(run?.kind))throw new Error('MCP runtime run not found.');
  const live=this.active.get(runId);return {run:{...run,...(run.status==='running'&&!live?{status:'interrupted',outcome:'unknown-after-restart'}:{})},trace:live&&run.executionId?this.trace(run.executionId):run.trace||null,persistenceError:this.persistenceErrors.get(runId)||null,limitations:[run.kind==='mcp-flow-run'?'Linear sandbox chain execution; no general renderer event-bus dispatch.':'Single-node sandbox execution; no downstream Flow execution.','A historical interrupted run is never automatically replayed.']};
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
