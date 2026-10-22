// Explicit local-only LM Studio smoke; uses a temporary profile, never app/project mutations.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {CustomNodeLocalAi}=require('../core/desktop/custom-node-local-ai.cjs');
const {StandardNodeRuntime}=require('../core/desktop/standard-node-runtime.cjs');
const catalog=require('../core/runtime/ai-provider-catalog.js');
(async()=>{
 const model=process.env.TL_LM_STUDIO_TEST_MODEL,tokenFile=process.env.TL_LM_STUDIO_TOKEN_FILE;
 assert.ok(model,'Set an actual LM Studio catalog model using TL_LM_STUDIO_TEST_MODEL');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tl-standard-provider-live-'));
 const profile={...catalog.find([],'local_lm_studio'),model,...(process.env.TL_LM_STUDIO_TEST_BASE?{endpoint:process.env.TL_LM_STUDIO_TEST_BASE}:{}),...(tokenFile?{apiKey:fs.readFileSync(tokenFile,'utf8').trim()}:{})};
 const traces=[];
 const persistence={readDevelopmentRecords:()=>[profile],writeDevelopmentRecords:({records})=>{for(const record of records){const index=traces.findIndex(item=>item.id===record.id);if(index<0)traces.push(record);else traces[index]=record;}}};
 const localAi=new CustomNodeLocalAi({persistence});
 const runtime=new StandardNodeRuntime({persistence,pythonPacks:{list:()=>[]},localAi});
 const models=await runtime.models({providerId:profile.id});assert.ok(models.models.some(item=>item.id===model),'Use an exact current catalog model');
 const runs=[];
 for(const lmStudioTransport of ['native','compatible']){
  const result=await localAi.complete({executionId:lmStudioTransport,request:{nodeId:'local-smoke',package:{packageId:'tl.standard.llm-custom'},permissions:{aiProvider:true},config:{aiProviderId:profile.id,model,lmStudioTransport,temperature:'0'},context:{workspaceId:'isolated-local-smoke'}},arguments:{messages:[{role:'user',content:'Reply briefly with OK to confirm this local software test.'}]}});
  assert.ok(result.text.trim());assert.equal(result.provenance.model,model);runs.push({mode:lmStudioTransport,text:result.text,provenance:result.provenance});
 }
 assert.ok(!profile.apiKey||!JSON.stringify({traces,runs}).includes(profile.apiKey));
 fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({passed:true,runs,traces,noAppOrProjectMutation:true},null,2),{mode:0o600});
 console.log(JSON.stringify({passed:true,modes:runs.map(run=>run.mode),root}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
