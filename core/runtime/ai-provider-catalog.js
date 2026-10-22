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
  const list=records=>{
    const profiles=(records||[]).map(record=>({...content(record),id:record.id||content(record).id}));
    for(const profile of local)if(!profiles.some(item=>item.id===profile.id))profiles.push({...profile});
    return profiles;
  };
  const autoLocal=profiles=>{
    const local=profile=>Boolean(profile.local||profile.localFirst||/^local_/.test(profile.id||''));
    return profiles.find(profile=>local(profile)&&(profile.status||profile.state)==='online')||profiles.find(local);
  };
  const find=(records,id)=>id?list(records).find(profile=>profile.id===id):autoLocal(list(records));
  return {localDefaults:()=>local.map(profile=>({...profile})),list,find,autoLocal};
});
