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
 const messages=config.messagesJson?JSON.parse(config.messagesJson).map(message=>({role:message.role,content:message.inputPath!==undefined?encode(at(message.inputPath),message.format||'text',message.key||''):message.content})):[...(config.instructions?[{role:'system',content:config.instructions}]:[]),{role:'user',content:encode(at(config.inputPath),config.inputFormat,config.inputFormat==='json'?config.inputKey:'')}];
 if(!Array.isArray(messages)||!messages.length||messages.some(message=>!['system','user','assistant'].includes(message.role)||typeof message.content!=='string'))throw new Error('Messaggi LLM non validi');
 if(config.guardTermsPath){const terms=at(config.guardTermsPath);if(!Array.isArray(terms)||terms.some(term=>typeof term!=='string'||!term))throw new Error('Il controllo termini richiede un array di stringhe non vuote');const serialized=JSON.stringify(messages).toLocaleLowerCase();const residual=terms.filter(term=>serialized.includes(term.toLocaleLowerCase()));if(residual.length){await log('Controllo termini non superato',{residual});throw new Error('Termini vietati nel messaggio. Nessuna richiesta LLM inviata.');}}
 if(config.allowOnline&&((config.temperature??'')!==''||(config.maxTokens??'')!==''||(config.topP??'')!==''||config.responseFormat!=='text'))throw new Error('Il trasporto Login usa modello e parametri del profilo; svuotare i parametri API non supportati.');
 await log('Messaggi LLM effettivi',{messages,online:config.allowOnline,providerId:config.aiProviderId});
 const result=await (config.allowOnline?tools.ai.completeLogin({messages}):tools.ai.complete({messages}));
 await emit('output',{...(config.preserveInput?data:{}),[config.outputKey]:result});
}`;
class StandardNodeRuntime {
  constructor({persistence,pythonPacks,localAi,loginBridge}){Object.assign(this,{persistence,pythonPacks,localAi,loginBridge});}
  config(id,value={}){
    const template=templates.get(id);if(!template)throw Error('Template standard sconosciuto');
    for(const key of Object.keys(value))if(!Object.hasOwn(template.settingsSchema,key))throw Error('Configurazione standard sconosciuta: '+key);
    const config=resolveSettings(template.settingsSchema,value);
    const contract=require('../runtime/runtime-contract.js').TrackerLensRuntimeContract;
    for(const [key,field] of Object.entries(template.settingsSchema)){const result=contract.validateConfigValue(config[key],field,key);if(!result.ok)throw Error(result.errors.join('\n'));}
    if(id==='python-custom'){const params=JSON.parse(config.parametersJson);if(!params||typeof params!=='object'||Array.isArray(params))throw Error('Parametri Python: occorre un oggetto JSON');}
    else {
      if(!config.outputKey||['__proto__','constructor','prototype'].includes(config.outputKey))throw Error('Campo risultato non valido');
      for(const key of ['temperature','maxTokens','topP'])if(config[key]!==''&&(!Number.isFinite(Number(config[key]))||(key==='maxTokens'&&(!Number.isSafeInteger(Number(config[key]))||Number(config[key])<0))))throw Error('Parametro LLM non valido: '+key);
      if(config.messagesJson&&!Array.isArray(JSON.parse(config.messagesJson)))throw Error('messagesJson deve essere un array');
    }
    return config;
  }
  buildNode({templateId,workspaceId,id,label,config={},position={x:0,y:0}}){
    const template=templates.get(templateId);if(!template)throw Error('Template standard sconosciuto');
    const values=this.config(templateId,config);
    return {id,workspaceId,type:'custom',subtype:templateId,label,inputs:['input'],outputs:['output'],channels:['input','output'],flowPosition:position,status:'idle',runtime:{status:'idle',active:false},metadata:{generatedBy:'mcp-standard-template',paletteLabel:template.name,subtype:templateId,category:template.category,icon:template.icon,configured:true,settingsSchema:template.settingsSchema,manifest:templates.manifest(templateId),config:values}};
  }
  async catalog(){
    const providers=providerCatalog.list(this.persistence.readDevelopmentRecords({storeName:'tl_ai_providers'})).map(profile=>{return {id:profile.id,name:profile.name||profile.id,provider:profile.provider||profile.providerType,connectionType:profile.connectionType||'api',model:profile.model||profile.defaultModel||''};});
    return {templates:templates.templates,providers,pythonPacks:this.pythonPacks.list(),execution:'Existing Core sandbox; persisted node configuration is authoritative. Login transmission requires allowOnline:true. Python has no filesystem/network/process grants.'};
  }
  async models({providerId}){
    const record=providerCatalog.find(this.persistence.readDevelopmentRecords({storeName:'tl_ai_providers'}),providerId);
    if(!record)throw Error('Profilo LLM non trovato');
    const profile=record.content||record;
    if(profile.connectionType==='login')return this.loginBridge.listModels({provider:profile.bridgeProvider||profile.provider});
    const provider=this.localAi.describe({...profile,id:record.id,model:profile.model||profile.defaultModel||'metadata-only'});
    if(!provider.ready)throw Error(provider.issue);
    const url=provider.protocol==='ollama-chat'?provider.endpoint.replace(/\/api\/chat$/, '/api/tags'):provider.endpoint.replace(/\/chat\/completions$/, '/models');
    const secret=profile.apiKey||profile.token||profile.secret;
    const response=await this.localAi.fetch(url,{headers:secret?{Authorization:'Bearer '+secret}:{},redirect:'error'});
    if(!response.ok)throw Error('Catalogo modelli HTTP '+response.status);
    const data=await response.json();
    return {models:(data.data||data.models||[]).map(item=>({id:item.id||item.model||item.name})).filter(item=>typeof item.id==='string'),source:'configured-provider-model-catalog'};
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
