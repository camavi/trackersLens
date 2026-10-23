const crypto=require('node:crypto');
const providerCatalog=require('../runtime/ai-provider-catalog.js');
const templates=require('../runtime/standard-node-templates.js');
const {resolveSettings}=require('./custom-node-settings.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const llmSource=`export async function run({input,config,tools,emit,log}) {
 const data=input.input??{};
 const at=(path)=>!path?data:String(path).split('.').reduce((value,key)=>value?.[key],data);
 if(config.requireTruePath&&at(config.requireTruePath)!==true)throw new Error('Controllo esplicito non superato: '+config.requireTruePath+'. Nessuna richiesta LLM inviata.');
 const encode=(value,format,key)=>{if(value===undefined)throw new Error('Dato in ingresso mancante');return format==='json'?JSON.stringify(key?{[key]:value}:value):typeof value==='string'?value:JSON.stringify(value);};
 const native=config.agentContractJson?JSON.parse(config.agentContractJson):null;
 const payloadText=encode(at(config.inputPath),config.inputFormat,config.inputFormat==='json'?config.inputKey:'');
 const prompt=native?.promptConfig;
 const rendered=prompt?.template?prompt.template.replace(/\{\{(payload|event|channel|workspace|timestamp|memory)\}\}/g,(_match,key)=>({payload:payloadText,event:payloadText,channel:'input',workspace:native.workspaceId||'',timestamp:new Date().toISOString(),memory:''})[key]):payloadText;
 const system=[config.instructions,prompt?.outputInstructions].filter(Boolean).join('\\n');
 const messages=config.messagesJson?JSON.parse(config.messagesJson).map(message=>({role:message.role,content:message.inputPath!==undefined?encode(at(message.inputPath),message.format||'text',message.key||''):message.content})):[...(system?[{role:'system',content:system}]:[]),{role:'user',content:rendered}];
 if(!Array.isArray(messages)||!messages.length||messages.some(message=>!['system','user','assistant'].includes(message.role)||typeof message.content!=='string'))throw new Error('Messaggi LLM non validi');
 if(config.guardTermsPath){const terms=at(config.guardTermsPath);if(!Array.isArray(terms)||terms.some(term=>typeof term!=='string'||!term))throw new Error('Il controllo termini richiede un array di stringhe non vuote');const serialized=JSON.stringify(messages).toLocaleLowerCase();const residual=terms.filter(term=>serialized.includes(term.toLocaleLowerCase()));if(residual.length){await log('Controllo termini non superato',{residual});throw new Error('Termini vietati nel messaggio. Nessuna richiesta LLM inviata.');}}
 if(config.allowOnline&&((config.temperature??'')!==''||(config.maxTokens??'')!==''||(config.topP??'')!==''||config.responseFormat!=='text'))await log('Parametri API conservati ma non applicati al trasporto Login',{temperature:config.temperature,maxTokens:config.maxTokens,topP:config.topP,responseFormat:config.responseFormat});
 await log('Messaggi LLM effettivi',{messages,online:config.allowOnline,providerId:config.aiProviderId});
 const complete=()=>config.allowOnline?tools.ai.completeLogin({messages}):tools.ai.complete({messages});
 const completions=[await complete()];
 const limit=config.maxContinuationCalls??10;
 while(completions[completions.length-1].finishReason==='length'&&(limit===0||completions.length<=limit)){
   const last=completions[completions.length-1];
   messages.push({role:'assistant',content:last.text},{role:'user',content:'Continue exactly where the previous response stopped. Do not repeat already generated text.'});
   if(config.guardTermsPath){const terms=at(config.guardTermsPath),serialized=JSON.stringify(messages).toLocaleLowerCase();if(terms.some(term=>serialized.includes(term.toLocaleLowerCase())))throw new Error('Termini vietati nella continuazione. Nessuna nuova richiesta LLM inviata.');}
   await log('Continuazione LLM',{attempt:completions.length,messages});completions.push(await complete());
 }
 const last=completions[completions.length-1];
 const result=completions.length===1?last:{...last,text:completions.map(item=>item.text).join(''),completions};
 await emit('output',{...(config.preserveInput?data:{}),[config.outputKey]:result});
}`;
class StandardNodeRuntime {
  constructor({persistence,pythonPacks,localAi,loginBridge}){Object.assign(this,{persistence,pythonPacks,localAi,loginBridge});}
  config(id,value={}){
    const template=templates.get(id);if(!template)throw Error('Template standard sconosciuto');
    for(const key of Object.keys(value))if(!Object.hasOwn(template.settingsSchema,key))throw Error('Configurazione standard sconosciuta: '+key);
    const config=resolveSettings(template.settingsSchema,value);
    const contract=require('../runtime/runtime-contract.js').TrackerLensRuntimeContract;
    for(const [key,field] of Object.entries(template.settingsSchema)){const result=contract.validateConfigValue(config[key],field,key);if(!result.ok)throw Error(result.errors.join('\\n'));}
    if(id==='python-custom'){const params=JSON.parse(config.parametersJson);if(!params||typeof params!=='object'||Array.isArray(params))throw Error('Parametri Python: occorre un oggetto JSON');}
    else {
      if(!config.outputKey||['__proto__','constructor','prototype'].includes(config.outputKey))throw Error('Campo risultato non valido');
      for(const key of ['temperature','maxTokens','topP'])if(config[key]!==''&&(!Number.isFinite(Number(config[key]))||(key==='maxTokens'&&(!Number.isSafeInteger(Number(config[key]))||Number(config[key])<0))))throw Error('Parametro LLM non valido: '+key);
      if(config.agentContractJson){const agent=JSON.parse(config.agentContractJson);if(!agent||typeof agent!=='object'||Array.isArray(agent))throw Error('Configurazione LLM: occorre un oggetto JSON');}
      if(config.messagesJson&&!Array.isArray(JSON.parse(config.messagesJson)))throw Error('messagesJson deve essere un array');
    }
    return config;
  }
  buildNode({templateId,workspaceId,id,label,config={},position={x:0,y:0}}){
    const template=templates.get(templateId);if(!template)throw Error('Template standard sconosciuto');
    const values=this.config(templateId,config);
    return {id,workspaceId,type:'custom',subtype:templateId,label,inputs:['input'],outputs:['output'],channels:['input','output'],flowPosition:position,status:'idle',runtime:{status:'idle',active:false},metadata:{generatedBy:'mcp-standard-template',paletteLabel:template.name,subtype:templateId,category:template.category,icon:template.icon,configured:true,settingsSchema:template.settingsSchema,manifest:templates.manifest(templateId),config:values}};
  }
  observation(scope,cancel=false){
    const node=this.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:scope.nodeId});
    if(!node||node.workspaceId!==scope.workspaceId||templates.kindOf(node)!=='llm-custom')throw Error('Nodo LLM non trovato nel workspace');
    return this.localAi.observation(scope,cancel);
  }
  async catalog(){
    const providers=providerCatalog.list(this.persistence.readDevelopmentRecords({storeName:'tl_ai_providers'})).map(profile=>{return {id:profile.id,name:profile.name||profile.id,provider:profile.provider||profile.providerType,...providerCatalog.connection(profile),model:profile.model||profile.defaultModel||'',executionIssue:providerCatalog.connection(profile).connectionType==='login'?'':this.localAi?.describe?.({...profile,model:profile.model||'metadata-only'})?.issue||''};});
    return {templates:templates.templates,providers,pythonPacks:this.pythonPacks.list(),execution:'Existing Core sandbox; persisted node configuration is authoritative. Login transmission requires allowOnline:true. Python has no filesystem/network/process grants.'};
  }
  async models({providerId}){
    const record=providerCatalog.find(this.persistence.readDevelopmentRecords({storeName:'tl_ai_providers'}),providerId);
    if(!record)throw Error('Profilo LLM non trovato');
    const profile=record.content||record,connection=providerCatalog.connection(profile);
    if(connection.connectionType==='login')return this.loginBridge.listModels({provider:connection.bridgeProvider});
    const provider=this.localAi.describe({...profile,id:record.id,model:profile.model||profile.defaultModel||'metadata-only'});
    let url,base;
    try{base=new URL(profile.endpoint||profile.baseUrl||profile.runtime?.endpoint);}catch{throw Error('Configura l’endpoint del provider nell’AI Center');}
    if(profile.modelsUrl){
      url=new URL(profile.modelsUrl,base);
      if(url.origin!==base.origin)throw Error('Il catalogo modelli deve appartenere allo stesso servizio del provider; le credenziali non vengono inoltrate ad altri siti.');
    }else{
      if(!provider.ready)throw Error(provider.issue+' Configura l’URL catalogo modelli nell’AI Center oppure inserisci l’ID del modello.');
      url=new URL(provider.protocol==='ollama-chat'?provider.endpoint.replace(/\/api\/chat$/, '/api/tags'):provider.endpoint.replace(/\/chat\/completions$/, '/models'));
    }
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.protocol!=='https:'))throw Error('URL catalogo non valido: usa HTTPS o un servizio locale, senza credenziali nell’URL.');
    const secret=profile.apiKey||profile.token||profile.secret;
    const response=await this.localAi.fetch(url.href,{headers:secret?{Authorization:'Bearer '+secret}:{},redirect:'error'});
    if(!response.ok)throw Error('Catalogo modelli HTTP '+response.status);
    const data=await response.json(),items=Array.isArray(data)?data:data.data||data.models;
    if(!Array.isArray(items))throw Error('Il catalogo deve restituire JSON: un elenco oppure data/models. Inserisci manualmente l’ID se il servizio non espone un catalogo.');
    return {models:items.map(item=>typeof item==='string'?{id:item}:({...item,id:item.id||item.model||item.name})).filter(item=>typeof item.id==='string'&&item.id),source:'configured-provider-model-catalog',url:url.href};
  }

  async load({templateId,nodeId,workspaceId}){
    const node=this.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:nodeId});
    if(!node||node.workspaceId!==workspaceId||templates.kindOf(node)!==templateId||node.type!=='custom')throw Error('Nodo standard non trovato nel workspace richiesto');
    if(JSON.stringify(node.inputs)!=='["input"]'||JSON.stringify(node.outputs)!=='["output"]')throw Error('Porte standard non valide');
    const config=this.config(templateId,node.metadata?.config||{});
    let execution,source=llmSource,parameters;
    if(templateId==='python-custom'){
      const pack=this.pythonPacks.list().find(pack=>pack.id===config.packId&&pack.trusted);
      if(!pack)throw Error('Seleziona un pack Python gestito e attendibile dal catalogo TL');
      source=config.code;parameters=JSON.parse(config.parametersJson);
      execution={runtime:'python',entry:'runtime.py',dependencies:{python:{packId:pack.id,environment:pack.environment,lockfile:pack.lockfile,requirements:pack.packages.map(item=>({name:item.name,version:'=='+item.version.replace(/^==/, '')})),installPolicy:'managed-required'}}};
    }
    const permissions=templateId==='llm-custom'?{aiProvider:!config.allowOnline,externalAiProvider:config.allowOnline}:{};
    const manifest={id:'tl.standard.'+templateId,name:templates.get(templateId).name,version:'1.0.0',subtype:templateId,category:templates.get(templateId).category,inputs:['input'],outputs:['output'],permissions,settingsSchema:{},runtime:{entry:execution?'runtime.py':'runtime.js',mode:'sandboxed'},...(execution?{execution}:{})};
    const effectiveConfig={...config};
    for(const key of ['model','temperature','maxTokens','topP'])if(effectiveConfig[key]==='')delete effectiveConfig[key];
    return {node,config:{...effectiveConfig,...(parameters?{parameters}:{})},source,packageRecord:{packageId:manifest.id,version:manifest.version,archive:{sha256:hash(source)},runtimeExecution:'sandboxed',permissions,grantedPermissions:permissions,manifest}};
  }
}
module.exports={StandardNodeRuntime,llmSource};
