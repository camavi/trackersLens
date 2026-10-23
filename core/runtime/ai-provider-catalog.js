// Shared TL provider defaults, extracted unchanged from the existing AI Runtime store.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerLensAiProviderCatalog=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  const local = [
    {
      id: "local_ollama",
      name: "Ollama",
      provider: "ollama",
      model: "llama3.1",
      endpoint: "http://127.0.0.1:11434",
      healthPath: "/api/tags",
      local: true,
      priority: 10,
      status: "idle",
      icon: "memory",
    },
    {
      id: "local_lm_studio",
      name: "LM Studio",
      provider: "lm-studio",
      model: "local-model",
      endpoint: "http://127.0.0.1:1234/v1",
      healthPath: "/models",
      local: true,
      priority: 20,
      status: "idle",
      icon: "dns",
    },
  ];
  const content=record=>record?.content&&typeof record.content==='object'?record.content:record;
  const connection=record=>{
    const profile=content(record)||{},clean=value=>String(value||'').trim().toLowerCase();
    const type=clean(profile.provider||profile.providerType),id=clean(profile.id||record?.id);
    const legacy=/^(?:global_)?external_(codex|claude)$/.exec(id)?.[1]||'';
    const endpoint=profile.endpoint||profile.baseUrl||profile.runtime?.endpoint;
    const explicit=clean(profile.connectionType);
    const login=explicit==='login'||(!explicit&&!endpoint&&(profile.globalExternal||legacy||type==='codex'));
    const bridge=clean(profile.bridgeProvider)||({chatgpt:'codex',openai:'codex',codex:'codex',anthropic:'claude',claude:'claude'}[type])||legacy;
    const bridgeProvider=login?bridge:'';
    return {connectionType:login?'login':'api',bridgeProvider,vendor:profile.vendor||(['codex','openai'].includes(type)||bridgeProvider==='codex'?'openai':['claude','anthropic'].includes(type)||bridgeProvider==='claude'?'anthropic':type)};
  };
  const list=records=>{
    const profiles=(records||[]).map(record=>({...content(record),id:record.id||content(record).id}));
    for(const profile of local)if(!profiles.some(item=>item.id===profile.id))profiles.push({...profile});
    for(const bridgeProvider of ['codex','claude'])if(!profiles.some(profile=>connection(profile).bridgeProvider===bridgeProvider))profiles.push({id:'global_external_'+bridgeProvider,name:bridgeProvider==='codex'?'ChatGPT · Login (Codex)':'Claude · Login',provider:bridgeProvider,connectionType:'login',bridgeProvider,globalExternal:true,model:'',local:false});
    return profiles.map(profile=>({...profile,...connection(profile)}));
  };
  const autoLocal=profiles=>{
    const local=profile=>Boolean(profile.local||profile.localFirst||/^local_/.test(profile.id||''));
    return profiles.find(profile=>local(profile)&&(profile.status||profile.state)==='online')||profiles.find(local);
  };
  const find=(records,id)=>id?list(records).find(profile=>profile.id===id):autoLocal(list(records));
  return {localDefaults:()=>local.map(profile=>({...profile})),list,find,autoLocal,connection};
});
