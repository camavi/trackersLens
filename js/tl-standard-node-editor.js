// Standard LLM/Python editor, using TL's shared JSswift runtime editor shell.
window.TrackerLensStandardNodeEditor=(()=>{
  const open=async({node,onSave})=>{
    const _=window.JSswift||window._,templates=window.TrackerLensStandardNodes;
    const kind=templates.kindOf(node),template=templates.get(kind),catalog=await window.trackers.runtime.standardNodes.catalog();
    const config={...templates.defaults(kind),...node.metadata?.config},controls=new Map();
    const editor=window.TrackerLensAiAgentEditor, nativeFields=editor.fields;
    let mountedForm=null;
    const nativeKeys={aiProviderId:'providerProfile',model:'model',temperature:'temperature',maxTokens:'maxTokens',topP:'topP',responseFormat:'responseFormat',lmStudioTransport:'lmStudioTransport'};
    const feedback=_.p({role:'alert'}),raw=_.pre({class:'tl-standard-node-raw'});
    const current=()=>{
      const values={...config,...Object.fromEntries([...controls].map(([key,input])=>[key,template.settingsSchema[key]?.type==='boolean'?input.value==='true':template.settingsSchema[key]?.type==='number'?Number(input.value):input.value]))};
      if(kind==='llm-custom'&&mountedForm)for(const [key,name] of Object.entries(nativeKeys)){
        const input=mountedForm.querySelector(`[name="${name}"]`);if(input)values[key]=input.value;
      }
      return values;
    };
    const updateRaw=()=>{raw.textContent=JSON.stringify(current(),null,2);};
    const field=(key,{options,rows}={})=>{
      const schema=template.settingsSchema[key],value=config[key];let input;
      let root;
      if(options||schema.type==='boolean'){
        const items=options||[{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}];
        root=nativeFields.select(schema.label,key,schema.type==='boolean'?String(value):value,items);
        input=root.querySelector(`[name="${key}"]`);
      }else if(rows){root=nativeFields.textarea(schema.label,key,value,rows);input=root.querySelector('textarea');}
      else {root=nativeFields.input(schema.label,key,value,{type:schema.type==='number'?'number':'text'});input=root.querySelector('input');}
      input.setAttribute('data-config-key',key);input.setAttribute('data-preserve-whitespace','true');
      input.addEventListener('input',updateRaw);input.addEventListener('change',updateRaw);
      controls.set(key,input);
      if(rows)root.classList.add('is-wide');
      if(key==='code')input.classList.add('tl-standard-node-code');
      return root;
    };
    const tabs=[];
    if(kind==='llm-custom'){
      tabs.push({name:'prompt',label:'Prompt e messaggi',icon:'auto_awesome',content:_.div({class:'tl-ai-agent-tab-grid'},field('instructions',{rows:12}),field('messagesJson',{rows:10}),_.p('Messaggi avanzati: array di oggetti con role e content, oppure inputPath, format e key. Se impostati sostituiscono istruzioni e messaggio automatico.'))});
      tabs.push({name:'bindings',label:'Input e output',icon:'input',content:_.div({class:'tl-ai-agent-tab-grid'},field('inputPath'),field('inputFormat',{options:['text','json']}),field('inputKey'),field('outputKey'),field('preserveInput'))});
      tabs.push({name:'checks',label:'Controlli espliciti',icon:'verified_user',content:_.div({class:'tl-ai-agent-tab-grid'},field('requireTruePath'),field('guardTermsPath'),_.p('Controlli opzionali configurati nel nodo. Si applicano prima della chiamata, anche ai messaggi avanzati.'))});
    }else{
      const packs=[{value:'',label:'Seleziona pack gestito'},...catalog.pythonPacks.filter(pack=>pack.trusted).map(pack=>({value:pack.id,label:pack.id+' · '+pack.environment+' · '+pack.status}))];
      if(config.packId&&!packs.some(pack=>pack.value===config.packId))packs.push({value:config.packId,label:'Pack non disponibile: '+config.packId});
      tabs.push({name:'python',label:'Codice Python',icon:'code',content:_.div({class:'tl-ai-agent-tab-grid'},field('code',{rows:22}))});
      tabs.push({name:'environment',label:'Ambiente e parametri',icon:'memory',content:_.div({class:'tl-ai-agent-tab-grid'},field('packId',{options:packs}),field('timeoutMs'),field('parametersJson',{rows:12}),_.p('Firma: def run(*, input, config, emit, log). Parametri in config["parameters"]. Il codice usa la sandbox Python di TL.'))});
    }
    const traces=_.pre({class:'tl-standard-node-raw'});
    const refreshTraces=async()=>{try{const records=await Promise.all(['tl_events','tl_flow_logs','tl_ai_logs','tl_ai_jobs'].map(async storeName=>({storeName,records:(await window.trackers.desktop.persistence.readDevelopmentRecords({storeName,workspaceId:node.workspaceId})).filter(record=>record.nodeId===node.id||record.sourceNodeId===node.id||record.targetNodeId===node.id||record.steps?.some(step=>step.nodeId===node.id))})));traces.textContent=JSON.stringify(records,null,2);}catch(error){feedback.textContent=error.message;}};
    tabs.push({name:'traces',label:'Dati e log',icon:'bug_report',content:_.div(_.Button({type:'button',onclick:refreshTraces},'Carica dati e log completi'),traces)});
    updateRaw();tabs.push({name:'configuration',label:'Configurazione completa',icon:'data_object',content:raw});
    const presentation=node.metadata?.standardPresentation||{};
    const agent={id:node.id,workspaceId:node.workspaceId,scope:'runtime',name:node.label||template.name,
      description:presentation.description??'',icon:presentation.icon||template.icon,color:presentation.color||'gold',
      category:presentation.category??template.category,tags:presentation.tags||[],version:presentation.version||'1.0.0',
      status:node.status||'idle',provider:{profileId:config.aiProviderId||'',model:config.model||'',temperature:config.temperature??'',maxTokens:config.maxTokens??'',topP:config.topP??'',responseFormat:config.responseFormat||'text',lmStudioTransport:config.lmStudioTransport||'auto'}};
    return editor.open({agent,dialogClass:'tl-standard-node-dialog',providers:catalog.providers,title:`Configure ${kind}`,subtitle:`${node.label||template.name} · ${template.name} runtime node`,
      modelCatalog:provider=>window.trackers.runtime.standardNodes.models(provider.id),
      composeTabs:nativeTabs=>{
        const general=nativeTabs.find(tab=>tab.name==='general');
        for(const name of ['scope','workspaceId','templateId']){
          const input=general.content.querySelector(`[name="${name}"]`);
          if(input){input.readOnly=true;const root=input.closest('.tl-ai-agent-field');if(root&&name==='scope'){root.inert=true;root.setAttribute('aria-disabled','true');}}
        }
        // Keep the existing native Provider tab and remove settings not supported by this executor.
        const provider=nativeTabs.find(tab=>tab.name==='provider');
        const supported=new Set(Object.values(nativeKeys));
        for(const child of [...provider.content.children]){
          const fields=[...child.querySelectorAll('[name]')];
          if(fields.length&&!fields.some(input=>supported.has(input.name)))child.remove();
        }
        if(kind==='llm-custom')provider.content.append(field('allowOnline'),field('timeoutMs'));
        return [general,...(kind==='llm-custom'?[provider]:[]),...tabs];
      },saveLabel:'Save Node',cancelLabel:'Cancel',onSave:async({form:nativeForm,close})=>{
      mountedForm=nativeForm;
      try{
        feedback.textContent='';const values=current();
        for(const key of ['parametersJson','messagesJson'])if(values[key]){const value=JSON.parse(values[key]);if(key==='parametersJson'&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('Parametri: occorre un oggetto JSON');if(key==='messagesJson'&&!Array.isArray(value))throw Error('Messaggi: occorre un array JSON');}
        const read=name=>nativeForm.querySelector(`[name="${name}"]`)?.value||'';
        const form=_.form(_.input({name:'label',value:read('name')}),_.input({name:'runtimeStatus',value:read('status')}));
        form.standardNodePresentation={description:read('description'),icon:read('icon'),color:read('color'),category:read('category'),tags:editor.splitList(read('tags')),version:read('version')};
        for(const [key,value] of Object.entries(values)){const attrs={'data-config-key':key,'data-preserve-whitespace':'true',value:String(value)};form.appendChild(typeof value==='string'?_.textarea(attrs):_.input({...attrs,type:typeof value==='boolean'?'checkbox':'number',checked:value===true}));}
        await onSave({form,close});
      }catch(error){feedback.textContent=error.message;}
    },footerActions:({formId})=>{window.requestAnimationFrame(()=>{mountedForm=document.getElementById(formId);mountedForm?.addEventListener('input',updateRaw);mountedForm?.addEventListener('change',updateRaw);updateRaw();});return feedback;}});
  };
  return {open};
})();
