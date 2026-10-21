const createFlowMapChatTestsView = ({ draft }) => {
  let dialog=null,body=null,timer=null,opened=null,busy=false,polling=false,error='',discovery=null,report=null,runs=[],selected='';
  let generation=0,sequence=0;
  const api=()=>window.trackers.desktop.chatTests;
  const current=()=>dialog&&opened.chatId===draft.activeChat.id&&opened.workspaceId===draft.workspaceId;
  const button=(text,action,disabled=false)=>_.Button({disabled,class:text==='Esegui tutti'?'is-primary':text==='Arresta test'?'is-danger':'',onClick:()=>void operate(action)},text);
  const refresh=async()=>{
    const version=++sequence,epoch=generation;
    try{
      const next=await api().list(opened);const id=next.find(run=>run.runId===selected)?.runId||next.at(-1)?.runId;
      const result=id?await api().report({...opened,runId:id}):null;
      if(!current()||epoch!==generation||version!==sequence)return;
      runs=next;selected=id||'';report=result;
    }catch(caught){if(current()&&epoch===generation)error=caught.message;}
  };
  const operate=async action=>{
    if(busy||!current())return;
    sequence++;busy=true;error='';render();
    try{await action();}catch(caught){error=caught.message;}
    finally{busy=false;if(current()){await refresh();render();}}
  };
  const confirm=preview=>new Promise(resolve=>{
    const review=_.Dialog({title:'Esegui test del progetto',class:'tl-flow-debugger-dialog',size:'lg',closeButton:true,onClose:()=>resolve(false),content:()=>_.div(_.p('Raccolta, import e test eseguono codice con i tuoi permessi locali, inclusi accesso ai file e alla rete.'),_.pre(JSON.stringify(preview,null,2))),actions:({close})=>_.Toolbar({align:'end',gap:8},_.Button({onClick:()=>{resolve(false);close();}},'Annulla'),_.Button({onClick:()=>{resolve(true);close();}},'Conferma test'))});review.open();
  });
  const execute=async(operation,files,caseNames,previous=null)=>{
    if(draft.busy)throw new Error('Attendi la fine del turno della chat prima di avviare test.');
    let found=discovery;
    if(previous)found={...await api().discover({...opened,folderId:draft.activeChat.projectFolder?.folderId,runner:previous.runner,paths:previous.sourceFiles.map(file=>file.relativePath)}),executable:previous.executable};
    if(!found)throw new Error('Scopri prima i file test.');
    const args={...opened,discoveryId:found.discoveryId,operation,...(files?{files}:{}),...(caseNames?{caseNames}:{}),...(found.executable?{executable:found.executable}:{})};
    const preview=await api().previewRun(args);
    if(!await confirm(preview)||!current())return;
    const result=await api().start({...args,previewToken:preview.previewToken,confirmed:true});selected=result.runId;
  };
  const discover=()=>{
    const runner=_.rod('node'),paths=_.rod(''),executable=_.rod('');
    const feedback=_.p({role:'alert'});let pending=false;
    const form=_.Dialog({title:'Scopri test',class:'tl-flow-debugger-dialog',size:'lg',closeButton:true,
      content:()=>_.div(_.Select({label:'Runner',model:runner,options:[{value:'node',label:'Node · node:test'},{value:'unittest',label:'Python · unittest'}]}),_.Textarea({name:'testPaths',label:'File o cartelle relativi (uno per riga)',model:paths,rows:4}),_.Input({name:'testExecutable',label:'Interprete opzionale (nome o percorso assoluto)',model:executable}),feedback),
      actions:({close})=>_.Toolbar({align:'end',gap:8},_.Button({onClick:close},'Annulla'),_.Button({onClick:async()=>{
        if(pending||!current())return;pending=true;
        try{
          if(!draft.activeChat.projectFolder)draft.activeChat.projectFolder=await window.trackers.desktop.chatProject.chooseFolder({chatId:opened.chatId});
          if(!draft.activeChat.projectFolder?.folderId)throw new Error('Seleziona il progetto.');
          const result=await api().discover({...opened,folderId:draft.activeChat.projectFolder.folderId,runner:runner.value,paths:paths.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)});
          discovery={...result,executable:executable.value.trim()};close();render();
        }catch(caught){feedback.textContent=caught.message;}finally{pending=false;}
      }},'Scopri file')),
    });form.open();
  };
  const stop=async()=>{
    if(draft.busy)throw new Error('Usa Interrompi della chat durante un turno attivo.');
    if(await confirm({operation:'stop',runId:selected,runner:report.runner})&&current())await api().stop({...opened,runId:selected,confirmed:true});
  };
  const render=()=>{
    if(!current())return;
    const expanded=new Map([...body.querySelectorAll('details')].map(node=>[node.querySelector('summary')?.textContent,node.open]));
    const scroll=body.parentElement?.scrollTop;const locked=busy||draft.busy;
    body.replaceChildren(
      _.Toolbar({gap:8},button('Scopri test',discover,busy),button('Aggiorna report',refresh,busy)),error?_.p({role:'alert'},error):_.span(),
      discovery?_.details({open:true},_.summary(`${discovery.runner} · ${discovery.files.length} file test`),_.Toolbar({gap:8},button('Esegui tutti',()=>execute('run'),locked||!discovery.files.length),discovery.runner==='unittest'?button('Raccogli casi',()=>execute('collect'),locked||!discovery.files.length):null),...discovery.files.map(file=>_.Row({gap:8},_.code(file.relativePath),button('Esegui file',()=>execute('run',[file.relativePath]),locked))),_.details(_.summary('Scoperta completa'),_.pre(JSON.stringify(discovery,null,2)))):_.p('Nessun file test scoperto.'),
      _.Toolbar({gap:6},...runs.map(run=>button(`${run.runner} · ${run.status} · ${new Date(run.createdAt).toLocaleString()}`,async()=>{selected=run.runId;},busy))),
      ...(report?[
        _.strong(`${report.runner} · ${report.status} · exit ${report.exitCode??'—'}`),
        _.p(`Report ${report.reportComplete?'completo':'incompleto'} · File test ${report.sourceFilesCurrent===true?'invariati':report.sourceFilesCurrent===false?'modificati':'da verificare'}`),
        _.p(report.empty===null?'Casi test da verificare: risultato di file o test con nome di file.':report.empty?'Nessun caso test eseguito.':JSON.stringify(report.counts)),
        _.Toolbar({gap:8},button('Riesegui file del report',()=>execute('run',null,null,report),locked),['running','starting'].includes(report.status)?button('Arresta test',stop,locked):null),
        _.details({open:true},_.summary(`Risultati · ${report.cases.length}`),...report.cases.map(item=>_.details({open:['failed','error','unexpected_success'].includes(item.status)},_.summary(`${item.kind==='file-or-test'?'file/test · ':''}${item.status} · ${item.fullName||item.name}`),item.kind!=='suite'?button('Riesegui caso',()=>execute('run',null,[item.fullName||item.name],report),locked):null,_.pre(JSON.stringify(item,null,2))))),
        report.catalog.length?_.details({open:true},_.summary(`Casi raccolti · ${report.catalog.length}`),...report.catalog.map(item=>_.Row({gap:8},_.code(item.caseId),button('Esegui caso',()=>execute('run',null,[item.caseId],report),locked)))):_.span(),
        _.details({open:true},_.summary('Output completo'),_.pre(report.stdout),_.pre(report.stderr)),
        _.details(_.summary('Report ed eventi completi'),_.pre(JSON.stringify(report,null,2))),
      ]:[]),
    );
    for(const node of body.querySelectorAll('details')){const key=node.querySelector('summary')?.textContent;if(expanded.has(key))node.open=expanded.get(key);}
    if(body.parentElement)body.parentElement.scrollTop=scroll;
  };
  const openTests=async()=>{
    if(dialog)return;opened={chatId:draft.activeChat.id,workspaceId:draft.workspaceId};generation++;body=_.div({class:'tl-flow-prompt-tests'});discovery=null;error='';
    dialog=_.Dialog({title:'Test del progetto',class:'tl-flow-debugger-dialog',icon:'science',size:'xl',closeButton:true,content:()=>body,onClose:()=>{clearInterval(timer);timer=null;dialog=null;body=null;generation++;}});
    dialog.open();render();await refresh();render();
    if(current())timer=setInterval(async()=>{if(!current()){clearInterval(timer);dialog?.close();return;}if(!busy&&!polling){polling=true;try{await refresh();render();}finally{polling=false;}}},1000);
  };
  return {openTests,closeTests:()=>dialog?.close()};
};
