// Shared declarative templates. Execution remains in TL Core's existing sandbox.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerLensStandardNodes=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  const text=(label,defaultValue='',extra={})=>({type:'string',label,defaultValue,...extra});
  const templates=[
    {id:'llm-custom',name:'LLM Custom',icon:'psychology',category:'ai-agents',settingsSchema:{
      aiProviderId:text('Provider'),model:text('Modello (vuoto = profilo)'),
      lmStudioTransport:text('LM Studio protocol','auto',{enum:['auto','native','compatible']}),
      streaming:{type:'boolean',label:'Streaming',defaultValue:false},
      reasoningEffort:text('Livello di ragionamento'),speed:text('Modalità servizio'),maxContinuationCalls:{type:'number',label:'Max Continuations',defaultValue:10,minimum:0},
      agentContractJson:text('Configurazione completa nodo LLM'),
      allowOnline:{type:'boolean',label:'Invio al provider con login',defaultValue:false},
      instructions:text('Istruzioni'),inputPath:text('Percorso del dato in ingresso'),
      inputFormat:text('Formato messaggio','text',{enum:['text','json']}),inputKey:text('Chiave JSON','document'),
      messagesJson:text('Messaggi avanzati JSON'),outputKey:text('Campo risultato','llm'),
      preserveInput:{type:'boolean',label:'Conserva input nell’output',defaultValue:true},
      requireTruePath:text('Controllo esplicito: percorso che deve essere true'),guardTermsPath:text('Controllo esplicito: percorso elenco termini vietati'),
      temperature:text('Temperature (vuoto = profilo)'),maxTokens:text('Max tokens (vuoto = profilo, 0 = non impostato)'),topP:text('Top P (vuoto = profilo)'),responseFormat:text('Formato risposta API','text',{enum:['text','json','markdown','structured','signal']}),
      timeoutMs:{type:'number',label:'Timeout ms (0 = nessun limite)',defaultValue:0,minimum:0},
    }},
    {id:'python-custom',name:'Python Custom',icon:'code',category:'processors',settingsSchema:{
      packId:text('Pack Python gestito'),code:text('Codice Python',"def run(*, input, config, emit, log):\n    emit('output', input.get('input', {}))\n"),
      parametersJson:text('Parametri JSON','{}'),timeoutMs:{type:'number',label:'Timeout ms (0 = nessun limite)',defaultValue:0,minimum:0},
    }},
  ];
  const get=id=>templates.find(template=>template.id===id);
  const kindOf=node=>get(node?.metadata?.subtype||node?.subtype)?.id||'';
  const defaults=id=>Object.fromEntries(Object.entries(get(id).settingsSchema).map(([key,field])=>[key,field.defaultValue]));
  const manifest=id=>{const template=get(id);if(!template)throw Error('Template standard sconosciuto');return {version:'1.0.0',type:'custom',subtype:id,category:template.category,inputs:[{name:'input',type:'object'}],outputs:[{name:'output',type:'object'}],permissions:[],settingsSchema:template.settingsSchema,runtime:{mode:'sandboxed',standardTemplate:id}};};
  const paletteItems=()=>templates.map(template=>({label:template.name,icon:template.icon,tone:template.id==='llm-custom'?'gold':'blue',nodeType:'custom',subtype:template.id,category:template.category,inputs:['input'],outputs:['output'],permissions:[],settingsSchema:template.settingsSchema,manifest:manifest(template.id),runtime:{standardTemplate:template.id},connectionType:'TL standard · sandbox'}));
  return {templates,get,kindOf,defaults,manifest,paletteItems};
});
