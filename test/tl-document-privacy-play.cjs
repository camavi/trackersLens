// Opt-in acceptance of the existing document Flow's actual canvas Play button.
// Uses the normal profile and leaves the app open; creates no nodes/packages/profiles.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sourceRoot=process.env.TL_DOCUMENT_PRIVACY_EVIDENCE,root=process.env.TL_DOCUMENT_PLAY_EVIDENCE;
assert.ok(sourceRoot&&root,'Explicit existing-document and new Play evidence directories required');
const original=JSON.parse(fs.readFileSync(path.join(sourceRoot,'result.json')));
app.setPath('userData',path.join(app.getPath('appData'),'trackers-lens'));
if(!process.argv.some(arg=>arg.startsWith('--tl-project=')))process.argv.push('--tl-project='+original.ready.project);
process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX='1';require('../electron/main.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(!fs.existsSync(path.join(root,'complete.json')))app.whenReady().then(async()=>{try{
 const wait=async predicate=>{for(let i=0;i<600;i++){if(await predicate())return;await delay(100);}throw Error('Play acceptance UI wait timed out');};
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));
 const win=BrowserWindow.getAllWindows()[0];win.show();
 const js=code=>win.webContents.executeJavaScript(code,true);
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId:original.ready.workspaceId}});
 await wait(async()=>{try{return await js(`Boolean(document.querySelector('[data-flow-node-test-btn="${original.ids.source}"]'))&&!state.loading`);}catch{return false;}});
 const before=await js('state.testRun.runId');
 await js(`document.querySelector('[data-flow-node-test-btn="${original.ids.source}"]').click()`);
 await wait(async()=>await js('state.testRun.runId')!==before);
 const runId=await js('state.testRun.runId');console.log('CANVAS PLAY STARTED',runId);
 while(await js('state.testRun.running'))await delay(500);
 const result=await js('({runId:state.testRun.runId,summary:state.testRun.summary,verification:state.testRun.verification,errors:flowMapErrorAlerts.map(alert=>alert.message)})');
 assert.equal(result.runId,runId);assert.match(result.summary,/Live test completed/);assert.deepEqual(result.errors,[]);
 fs.writeFileSync(path.join(root,'complete.json'),JSON.stringify({...result,project:original.ready.project,workspaceId:original.ready.workspaceId,ids:original.ids,appLeftOpen:true},null,2));
 fs.writeFileSync(path.join(root,'play.png'),(await win.webContents.capturePage()).toPNG());console.log('CANVAS PLAY COMPLETED; TL LEFT OPEN');
}catch(error){console.error(error);fs.writeFileSync(path.join(root,'error.txt'),error.stack);}});
