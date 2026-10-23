// Read-only projections for standard nodes; shared by canvas, runtime and editor.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerLensStandardNodePresentation=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  const kindOf=node=>node?.metadata?.subtype||node?.subtype;
  const time=record=>Date.parse(record.completedAt||record.updatedAt||record.startedAt||record.createdAt||0)||0;
  const belongs=(record,node)=>record.workspaceId===node.workspaceId&&(record.nodeId===node.id||record.sourceNodeId===node.id||record.agentId===node.id);
  const rows=(node,catalog={})=>{
    const config=node.metadata?.config||{},kind=kindOf(node),row=(label,value,iconName)=>({label,value:String(value??''),iconName});
    if(kind==='llm-custom'){
      const provider=(catalog.providers||[]).find(item=>item.id===config.aiProviderId);
      return [row('Provider',provider?.name||config.aiProviderId||'Auto / local-first','dns'),row('Model',config.model||provider?.model||'Da profilo','memory'),row('Input',config.messagesJson?'Messaggi avanzati':config.inputPath||'input completo','input'),row('Output',config.outputKey||'llm','output'),row('Transport',config.allowOnline?'Login':config.lmStudioTransport||'auto','hub')];
    }
    if(kind==='python-custom'){
      const pack=(catalog.pythonPacks||[]).find(item=>item.id===config.packId);let mode='Custom';try{mode=JSON.parse(config.parametersJson||'{}').mode||mode;}catch{mode='Parametri non validi';}
      return [row('Pack',config.packId||'Non selezionato','inventory_2'),row('Environment',pack?.environment||'Non disponibile','memory'),row('Mode',mode,'code'),row('Input',(node.inputs||[]).join(' · '),'input'),row('Output',(node.outputs||[]).join(' · '),'output')];
    }
    return [];
  };
  const history=(node,{jobs=[],logs=[],events=[],flowLogs=[]}={})=>{
    const records=[],seen=new Set();
    const observations=logs.filter(log=>String(log.kind||'').startsWith('llm-'));
    logs=logs.filter(log=>!String(log.kind||'').startsWith('llm-'));
    const add=(source,owner=source)=>{const id=source.executionId||source.id;if(seen.has(id))return;seen.add(id);const matchingLogs=logs.filter(log=>belongs(log,node)&&log.executionId===source.executionId);const emitted=(source.result?.events||source.trace?.events||[]).filter(event=>event.kind==='emit');const config=node.metadata?.config||{};const output=emitted.at(-1)?.data;const llm=kindOf(node)==='llm-custom'?output?.[config.outputKey||'llm']:null;
      const steps=[{id:'input',type:'input',label:'Input',status:'complete',payload:source.inputs||{}},...matchingLogs.map(log=>({id:log.id,type:'provider',label:'Provider',status:log.status,payload:log})),...(source.result?.events||source.trace?.events||[]).map((event,index)=>({id:'event-'+index,type:event.kind,label:event.kind==='emit'?'Output · '+event.port:event.message||event.kind,status:source.status,payload:event}))];
      records.push({id:owner.id+(owner===source?'':':'+source.nodeId+':'+source.index),status:source.status,updatedAt:source.completedAt||source.updatedAt||owner.updatedAt||source.startedAt,task:node.label||node.id,provider:matchingLogs.at(-1)?.provider?.id||'',model:matchingLogs.at(-1)?.provider?.model||'',raw:{...source,inputTrace:{payload:source.inputs,inputEvent:{channel:(node.inputs||[]).join(' · '),runId:owner.id},trigger:{mode:owner.kind||'stored-runtime',triggerPolicy:owner.kind?.startsWith('mcp-')?'manual_only':'unknown'},config:source.config||node.metadata?.config||{}},workspaceId:node.workspaceId,runtimeNodeId:node.id,prompt:matchingLogs.at(-1)?.request?.prompt||(matchingLogs.length?JSON.stringify(matchingLogs.at(-1).request?.messages||[]):''),steps,result:llm||{text:output===undefined?'':JSON.stringify(output,null,2)},sourceRecord:owner,providerLogs:matchingLogs,observations:observations.filter(log=>belongs(log,node)&&log.executionId===source.executionId)}});
    };
    for(const job of jobs){if(job.workspaceId!==node.workspaceId)continue;if(job.kind==='mcp-flow-run'){for(const step of job.steps||[])if(step.nodeId===node.id)add(step,job);}else if(belongs(job,node))add(job);}
    for(const log of logs.filter(log=>belongs(log,node))){if(seen.has(log.executionId))continue;add({id:log.id,nodeId:node.id,executionId:log.executionId,status:log.status,startedAt:log.startedAt,completedAt:log.completedAt,inputs:log.request,result:{events:[]}},log);const record=records.at(-1);const response=log.normalizedResponse||log.response;record.raw.result={text:response?.text||response?.choices?.[0]?.message?.content||response?.message?.content||'',usage:response?.usage};}
    for(const event of [...events,...flowLogs]){if(!belongs(event,node))continue;const executionId=event.meta?.executionId||event.context?.executionId;if(!executionId||seen.has(executionId))continue;const related=[...events,...flowLogs].filter(item=>belongs(item,node)&&(item.meta?.executionId||item.context?.executionId)===executionId);add({id:executionId,executionId,status:event.status||'completed',updatedAt:event.createdAt,inputs:{},sourceRecords:related,result:{events:related.map(item=>({kind:String(item.eventType||'').includes('emit')?'emit':item.eventType||'event',port:item.channel,data:item.originalPayload??item.payload??item.context,message:item.message}))}});}
    return records.sort((a,b)=>time(b)-time(a));
  };
  const number=(...values)=>{const value=values.find(value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)));return value===undefined?null:Number(value);};
  const usageOf=log=>{const response=log.normalizedResponse||log.response||{},usage=response.usage||response.raw?.usage||{};const input=number(usage.prompt_tokens,usage.input_tokens,usage.promptTokens,response.prompt_eval_count),output=number(usage.completion_tokens,usage.output_tokens,usage.completionTokens,response.eval_count);return {input,output,total:number(usage.total_tokens,usage.totalTokens,input===null||output===null?null:input+output)};};
  const usage=(node,logs=[])=>{
    const unique=[...new Map(logs.filter(log=>belongs(log,node)&&!String(log.kind||'').startsWith('llm-')).map(log=>[log.id,log])).values()].sort((a,b)=>time(a)-time(b)),last=unique.at(-1),values=unique.map(usageOf),latest=last?usageOf(last):{input:null,output:null,total:null};
    const total=key=>values.length&&values.every(value=>value[key]!==null)?values.reduce((sum,value)=>sum+value[key],0):null;
    return {totalTokens:total('total'),totalPromptTokens:total('input'),totalCompletionTokens:total('output'),lastTokens:latest.total,lastPromptTokens:latest.input,lastCompletionTokens:latest.output,provider:last?.provider?.id||'',model:last?.provider?.model||'',updatedAt:last?.completedAt||last?.startedAt||'',calls:unique.length};
  };
  return {rows,history,usage};
});
