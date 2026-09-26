const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-llm-ui-'));
app.setPath('userData', directory);
const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'test.sqlite') });
persistence.initialize();
ipcMain.handle('trackers-core:request', (_event, command, args) => {
  if (command === 'desktop.persistence.readDevelopmentRecordById') return persistence.readDevelopmentRecordById(args);
  if (command === 'desktop.persistence.writeDevelopmentRecords') return persistence.writeDevelopmentRecords(args);
  throw new Error(`Unexpected command ${command}`);
});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const js = code => win.webContents.executeJavaScript(code);
  try {
    await win.loadFile(path.join(__dirname, 'fixtures/llm-inspector.html'));
    await js(`(async () => {
      window.TrackerLensAiRuntimeStore = {
        upsertLog: record => window.trackers.desktop.persistence.writeDevelopmentRecords({storeName:'tl_ai_logs', records:[record]}),
        listJobsForAgent: async () => ({records:[{id:'job'}]})
      };
      window.fixtureContext = {workspaceId:'w',nodeId:'agent',jobId:'job',runId:'r'};
      window.fixtureFrame = value => new TextEncoder().encode('data: '+JSON.stringify(value)+'\\n\\n');
      window.fixtureResult = window.TrackerLensLlmObservation.complete({context:window.fixtureContext,
        url:'http://fixture', body:{model:'fixture',messages:[{role:'system',content:'System fixture'},{role:'user',content:'Question fixture'}]},
        transport:async () => new Response(new ReadableStream({start(controller){window.fixtureController=controller;}}), {headers:{'content-type':'text/event-stream'}})
      }).then(() => 'completed', error => error.name);
      await window.TrackerLensLlmInspector.open({nodeId:'agent',workspaceId:'w'});
    })()`);
    await new Promise(resolve => setTimeout(resolve, 180));
    await js(`window.fixtureController.enqueue(window.fixtureFrame({choices:[{index:0,delta:{content:'Visible while generating <script>not executable</script>'},finish_reason:null}]}))`);
    await new Promise(resolve => setTimeout(resolve, 400));
    const live = await js(`({text:document.querySelector('.tl-llm-inspector').textContent, stop:[...document.querySelectorAll('button')].some(b=>b.textContent==='Stop generation'&&!b.disabled), scripts:document.querySelector('.tl-llm-inspector').querySelectorAll('script').length})`);
    assert.match(live.text, /Visible while generating/);
    assert.equal(live.stop, true);
    assert.equal(live.scripts, 0);
    assert.match(live.text, /System fixture/);
    // Follow the bottom after every layout update, including multi-page output.
    await js(`window.fixtureController.enqueue(window.fixtureFrame({choices:[{index:0,delta:{content:'\\n'+('stream line\\n').repeat(1700)+'TAIL_ONE'},finish_reason:null}]}))`);
    await new Promise(resolve => setTimeout(resolve, 500));
    const scrollState = () => js(`(() => {const el=document.querySelector('.tl-llm-output');return {gap:el.scrollHeight-el.clientHeight-el.scrollTop,top:el.scrollTop,text:el.textContent,follow:[...document.querySelectorAll('button')].find(b=>b.textContent==='Follow live').getAttribute('aria-pressed')};})()`);
    assert.ok((await scrollState()).gap <= 2);
    assert.match((await scrollState()).text, /TAIL_ONE/);
    await js(`window.fixtureController.enqueue(window.fixtureFrame({choices:[{index:0,delta:{content:'\\n'+('new line\\n').repeat(50)+'TAIL_TWO'},finish_reason:null}]}))`);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok((await scrollState()).gap <= 2);
    assert.equal((await scrollState()).follow, 'true');
    await js(`document.querySelector('.tl-llm-output').scrollTop=0`);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal((await scrollState()).follow, 'false');
    await js(`window.fixtureController.enqueue(window.fixtureFrame({choices:[{index:0,delta:{content:'\\nTAIL_THREE'},finish_reason:null}]}))`);
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal((await scrollState()).top, 0);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Follow live').click()`);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.ok((await scrollState()).gap <= 2);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop generation').click()`);
    assert.equal(await js('window.fixtureResult'), 'AbortError');
    await js(`window.TrackerLensLlmObservation.release('job')`);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.match(await js(`document.querySelector('.tl-llm-inspector').textContent`), /cancelled/);
    assert.equal(await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop generation').disabled`), true);
    await js(`window.TrackerLensLlmInspector.closeAll()`);
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(await js(`Boolean(document.querySelector('.tl-llm-inspector'))`), false);
    await js(`window.TrackerLensLlmInspector.open({nodeId:'agent',workspaceId:'w'})`);
    assert.match(await js(`document.querySelector('.tl-llm-inspector').textContent`), /TAIL_THREE/);
    await js(`(() => {
      window.TrackerLensAiRuntimeStore.listJobsForAgent = async () => ({records:[{id:'job-native'}]});
      window.nativeResult = window.TrackerLensLlmObservation.complete({context:{...window.fixtureContext,jobId:'job-native'},
        protocol:'lm-studio-native',url:'http://fixture/api/v1/chat',body:{model:'fixture',input:'Native question',store:false,integrations:[]},
        transport:async () => new Response(new ReadableStream({start(controller){window.nativeController=controller;}}),{headers:{'content-type':'text/event-stream'}})
      }).then(()=>'completed',error=>error.message);
    })()`);
    await new Promise(resolve => setTimeout(resolve, 180));
    await js(`[
      {type:'chat.start',model_instance_id:'fixture'},
      {type:'prompt_processing.start'},
      {type:'prompt_processing.progress',progress:0.38}
    ].forEach(event=>window.nativeController.enqueue(window.fixtureFrame(event)))`);
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.match(await js(`document.querySelector('.tl-llm-inspector [role="status"]').textContent`), /Processing prompt · 38.0%/);
    assert.equal(await js(`document.querySelector('.tl-llm-inspector progress').value`), 0.38);
    assert.equal(await js(`document.querySelector('.tl-llm-connection').textContent`), 'LIVE');
    fs.writeFileSync(path.join(directory, 'prefill.png'), (await win.webContents.capturePage()).toPNG());
    await js(`[
      {type:'prompt_processing.end'},
      {type:'reasoning.start'},
      {type:'reasoning.delta',content:'Provider notes'},
      {type:'reasoning.end'},
      {type:'message.start'},
      {type:'message.delta',content:'Native answer'},
      {type:'message.end'},
      {type:'chat.end',result:{model_instance_id:'fixture',output:[{type:'reasoning',content:'Provider notes'},{type:'message',content:'Native answer complete'}],stats:{input_tokens:100,total_output_tokens:20,reasoning_output_tokens:5,tokens_per_second:27.4,time_to_first_token_seconds:1.2}}}
    ].forEach(event=>window.nativeController.enqueue(window.fixtureFrame(event)))`);
    assert.equal(await js('window.nativeResult'), 'completed');
    await js(`window.TrackerLensLlmObservation.release('job-native')`);
    await new Promise(resolve => setTimeout(resolve, 350));
    const nativeText = await js(`document.querySelector('.tl-llm-inspector').textContent`);
    assert.match(nativeText, /27.40 tokens\/s \(provider\)/);
    assert.match(nativeText, /tokens: 120 \(provider\)/);
    assert.match(nativeText, /Native answer complete/);
    assert.equal((nativeText.match(/Native answer complete/g) || []).length, 1);
    await js(`window.TrackerLensLlmInspector.closeAll()`);
    await new Promise(resolve => setTimeout(resolve, 350));
    await js(`window.TrackerLensLlmInspector.open({nodeId:'agent',workspaceId:'w'})`);
    assert.match(await js(`document.querySelector('.tl-llm-inspector').textContent`), /27.40 tokens\/s/);
    const screenshot = path.join(directory, 'inspector.png');
    fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
    console.log(`Screenshot: ${screenshot}`);
    await js(`window.TrackerLensLlmInspector.closeAll()`);
    await new Promise(resolve => setTimeout(resolve, 350));
    await js(`(async () => {
      window.TrackerLensAiRuntimeStore.listJobsForAgent = async () => ({records:[{id:'job-buffered'}]});
      window.bufferedResult = window.TrackerLensLlmObservation.complete({context:{...window.fixtureContext,jobId:'job-buffered'},
        streaming:false,url:'http://fixture',body:{model:'fixture',messages:[]},
        transport:({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'}))))
      }).catch(error=>error.name);
      await window.TrackerLensLlmInspector.open({nodeId:'agent',workspaceId:'w',onConfigureNode:()=>{window.settingsOpened=true;}});
    })()`);
    await new Promise(resolve => setTimeout(resolve, 350));
    const buffered = await js(`({text:document.querySelector('.tl-llm-inspector').textContent, badge:document.querySelector('.tl-llm-connection').textContent,font:getComputedStyle(document.querySelector('.tl-llm-terminal')).fontSize})`);
    assert.equal(buffered.badge, 'BUFFERED');
    assert.match(buffered.text, /Streaming = true, save and start a new run/);
    assert.doesNotMatch(buffered.text, /Waiting for provider activity/);
    assert.equal(buffered.font, '12px');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Node settings').click()`);
    assert.equal(await js('window.settingsOpened'), true);
    // Opening settings must not cancel or silently mutate the in-flight request.
    assert.equal(await js(`window.TrackerLensLlmObservation.active({workspaceId:'w',nodeId:'agent'}).some(item=>item.jobId==='job-buffered')`), true);
    await js(`window.TrackerLensLlmObservation.cancel({...window.fixtureContext,jobId:'job-buffered'})`);
    assert.equal(await js('window.bufferedResult'), 'AbortError');
    console.log('LLM inspector: live text, native prefill progress before text, provider stats, real abort, inert output, SQLite replay and disposal passed.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
