// Isolated JSswift native editor acceptance. Does not open any user project.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const templates=require('../core/runtime/standard-node-templates.js');
const {StandardNodeRuntime}=require('../core/desktop/standard-node-runtime.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tl-standard-editor-')),repo=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'profile'));
app.whenReady().then(async()=>{try{
 const win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{contextIsolation:true,sandbox:true}});
 win.webContents.on('console-message',event=>console.log('RENDERER',event.message));
 const html=`<html data-theme="dark"><base href="file://${repo}/"><link rel="stylesheet" href="css/tl-jsswift.css"><link rel="stylesheet" href="css/cms-palette.css"><link rel="stylesheet" href="css/tl-foundation.css"><link rel="stylesheet" href="css/tl-ai-agent-editor.css"><script src="node_modules/jsswift/dist/jsswift.min.js"></script><script src="core/runtime/standard-node-templates.js"></script><script src="js/tl-ai-agent-editor.js"></script><script src="js/tl-standard-node-editor.js"></script><body></body></html>`;
 fs.writeFileSync(path.join(root,'editor.html'),html);await win.loadFile(path.join(root,'editor.html'));
 const catalog={templates:templates.templates,providers:[{id:'local',name:'Local profile',provider:'lm-studio',endpoint:'http://127.0.0.1:1234/v1',model:'fixture-model',connectionType:'api'}],pythonPacks:[{id:'managed.data',environment:'data',trusted:true,status:'ready'}]};
 await win.webContents.executeJavaScript(`window.TrackerLensAiRuntimeStore={providerDisplayLabel:p=>p.name,providerConnection:p=>({connectionType:p.connectionType||'api'}),isLoginProvider:p=>p.connectionType==='login'};window.trackers={runtime:{standardNodes:{catalog:async()=>(${JSON.stringify(catalog)}),models:async()=>({models:[{id:'fixture-model'}]})}},desktop:{persistence:{readDevelopmentRecords:async()=>[]}}};void 0;`);
 const standard=new StandardNodeRuntime({});
 for(const kind of ['llm-custom','python-custom']){
  const config=kind==='llm-custom'?{aiProviderId:'local',streaming:true,maxContinuationCalls:3,instructions:'Full prompt\nSecond line\n',inputPath:'document.text'}:{packId:'managed.data',code:"def run(*, input, config, emit, log):\n    emit('output', input)\n",parametersJson:'{"role":"source"}'};
  const node=standard.buildNode({templateId:kind,id:kind,workspaceId:'w',label:'Editor acceptance',config});
  await win.webContents.executeJavaScript(`(async()=>{window.saved=null;window.savedPresentation=null;window.editor=await window.TrackerLensStandardNodeEditor.open({node:${JSON.stringify(node)},onSave:async({form,close})=>{window.savedPresentation=form.standardNodePresentation;window.saved=Object.fromEntries([...form.querySelectorAll('[data-config-key]')].map(input=>[input.dataset.configKey,input.type==='checkbox'?input.checked:input.value]));close();}});})()`);
  const evidence=await win.webContents.executeJavaScript(`({title:document.querySelector('.jss-dialog')?.textContent||document.body.textContent,tabs:[...document.querySelectorAll('[role="tab"]')].map(tab=>tab.getAttribute('aria-label')||tab.textContent),code:document.querySelector('[data-config-key="code"]')?.value})`);
  const general=await win.webContents.executeJavaScript(`({fields:[...document.querySelectorAll('[role=tabpanel] [name]')].map(input=>input.name),instructions:document.querySelector('[data-config-key=instructions]')?.value})`);
  for(const name of ['name','description','icon','color','category','tags','version','status','workspaceId','templateId'])assert.ok(general.fields.includes(name),name+' must reuse the native General tab');
  await win.webContents.executeJavaScript(`document.querySelector('[name=description]').value='Custom description';document.querySelector('[name=tags]').value='custom, acceptance';void 0`);
  fs.writeFileSync(path.join(root,kind+'-general.png'),(await win.webContents.capturePage()).toPNG());
  assert.ok(evidence.title.includes(kind==='llm-custom'?'LLM Custom':'Python Custom'));assert.ok(evidence.tabs.some(tab=>tab.includes('Configurazione completa')));assert.ok(evidence.tabs.some(tab=>tab.includes('Dati e log')));if(kind==='llm-custom')for(const tab of ['Runtime','AI Provider','Inputs','Prompt','Memory','Outputs','Permissions','Debug'])assert.ok(evidence.tabs.includes(tab),'Native tab missing '+tab);
  if(kind==='python-custom'){await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role=tab]')].find(tab=>tab.getAttribute('aria-label')==='Codice Python').click()`);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-config-key=code]')?.value`),config.code);}
  else {
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role=tab]')].find(tab=>tab.getAttribute('aria-label')==='AI Provider').click()`);
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[name=providerProfile]').value`),'local');
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[name=temperature]').value`),'');
    for(const name of ['streaming','maxContinuationCalls','reasoningEffort','speed'])assert.ok(await win.webContents.executeJavaScript(`Boolean(document.querySelector('[name="${name}"]'))`),'Native provider setting missing '+name);
    fs.writeFileSync(path.join(root,kind+'-provider.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Aggiorna modelli')).click()`);
    await new Promise(resolve=>setTimeout(resolve,50));assert.equal(await win.webContents.executeJavaScript('window.saved'),null,'Model refresh must not save or close the editor');
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role=tab]')].find(tab=>tab.getAttribute('aria-label')==='Prompt').click()`);
    await new Promise(resolve=>setTimeout(resolve,250));
    const prompt=await win.webContents.executeJavaScript(`({value:document.querySelector('[data-config-key=instructions]')?.value,panels:[...document.querySelectorAll('[role=tabpanel]')].map(panel=>({name:panel.dataset.name,children:panel.childElementCount}))})`);
    assert.equal(prompt.value,config.instructions,JSON.stringify(prompt));
  }
  fs.writeFileSync(path.join(root,kind+'-content.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Save Node')).click()`);
  const saved=await win.webContents.executeJavaScript('window.saved');assert.ok(saved);
  if(kind==='python-custom')assert.equal(saved.code,config.code);else assert.equal(saved.instructions,config.instructions);
  const expected={...templates.defaults(kind),...config};for(const [key,value] of Object.entries(expected))if(key!=='agentContractJson')assert.equal(saved[key],typeof value==='boolean'?value:String(value),'Unchanged config '+key);
  if(kind==='llm-custom'){const contract=JSON.parse(saved.agentContractJson);for(const group of ['provider','runtime','channels','promptConfig','memory','permissions','debug'])assert.ok(contract[group]);assert.equal(contract.promptConfig.systemPrompt,config.instructions);assert.equal(contract.provider.streaming,true);assert.equal(contract.provider.maxContinuationCalls,3);}
  const presentation=await win.webContents.executeJavaScript('window.savedPresentation');assert.equal(presentation.description,'Custom description');assert.deepEqual(presentation.tags,['custom','acceptance']);
  await new Promise(resolve=>setTimeout(resolve,350));
 }
 // Ordinary Knowledge/Agent editor must use the same authenticated Core catalog as Custom.
 await win.webContents.executeJavaScript(`window.catalogRequests=[];window.trackers.runtime.standardNodes.models=async id=>{window.catalogRequests.push(id);return {models:[{id:'fixture-model'},{id:'second-model'}]};};window.fetch=async()=>{throw Error('Renderer network must not be used for desktop model discovery');};window.TrackerLensAiAgentEditor.open({agent:{id:'ordinary',name:'Ordinary LLM',provider:{profileId:'local',model:''}},providers:${JSON.stringify(catalog.providers)}});void 0;`);
 await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role=tab]')].find(tab=>tab.getAttribute('aria-label')==='AI Provider').click()`);
 for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript(`document.querySelector('.tl-ai-agent-model-meta')?.textContent.includes('2 models available')`))break;await new Promise(resolve=>setTimeout(resolve,50));}
 const ordinary=await win.webContents.executeJavaScript(`({requests:window.catalogRequests,meta:document.querySelector('.tl-ai-agent-model-meta')?.textContent,provider:document.querySelector('[name=providerProfile]').closest('.tl-ai-agent-field').textContent,model:document.querySelector('[name=model]').value})`);
 assert.ok(ordinary.requests.includes('local'));assert.match(ordinary.meta,/2 models available/);assert.match(ordinary.provider,/Local profile/);assert.ok(!ordinary.provider.includes('fixture-model'));assert.equal(ordinary.model,'');
 fs.writeFileSync(path.join(root,'ordinary-provider.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Annulla').click()`);
 fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({passed:true,templates:2,fullCodeAndPromptPreserved:true,allTabsSaved:true,ordinaryCoreCatalog:true,providerIdentitySeparateFromModel:true},null,2));console.log('STANDARD EDITOR PASS',root);app.quit();
}catch(error){console.error(error);app.exit(1);}});
