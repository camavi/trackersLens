const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fixture=require('./fixtures/document-privacy-packages.cjs');
const source=fixture.artifacts({}).python.source;
function python(role,payload,extra={}){
 const script='import json,sys\na=json.load(sys.stdin)\nnamespace={}\nexec(a["source"],namespace)\nout=[]\nnamespace["run"](input={"input":a["payload"]},config=a["config"],emit=lambda p,d:out.append(d),log=lambda *args:None)\nprint(json.dumps(out))';
 return JSON.parse(execFileSync('/usr/bin/python3',['-c',script],{input:JSON.stringify({source,payload,config:{role,canariesJson:JSON.stringify(fixture.canaries),...extra}}),encoding:'utf8'}))[0];
}
test('reversible spans preserve CRLF, Unicode and repeated values; unknown analysis tokens remain explicit',()=>{
 const entities=['Luca Rinaldi','Marta Bellini','luca.rinaldi@example.test','marta.bellini@example.test','+39 02 5550 1842','PRAT-2026-X7Q9','Via delle Querce 47','Milano'].map(value=>({value,type:'PII'}));
 const masked=python('mask',{document:{text:fixture.documentText},localLlm:{text:JSON.stringify({entities})}});assert.equal(masked.privacy.passed,true);
 for(const term of fixture.canaries)assert.ok(!masked.pseudonymizedText.toLowerCase().includes(term.toLowerCase()));
 const restored=python('restore',{...masked,onlineLlm:{text:masked.pseudonymizedText+' [[TL_PERSON_9999]]'}});
 assert.equal(restored.reconstructedDocument.text,fixture.documentText);assert.equal(restored.verification.roundTripIdentical,true);assert.deepEqual(restored.verification.unresolvedAnalysisTokens,['[[TL_PERSON_9999]]']);
});
test('incomplete local extraction visibly fails the configured privacy gate before any online call',async()=>{
 const masked=python('mask',{document:{text:fixture.documentText},localLlm:{text:'{"entities":[]}'}});assert.equal(masked.privacy.passed,false);assert.ok(masked.privacy.residualTerms.length);
 const online=await import('data:text/javascript;base64,'+Buffer.from(fixture.artifacts({}).online.source).toString('base64'));
 await assert.rejects(online.run({input:{input:masked},config:{instructions:'Analyze'},tools:{ai:{completeLogin:()=>assert.fail('No online request allowed')}},emit:()=>assert.fail('No normal output on privacy refusal'),log:async()=>{}}),/Nessuna richiesta online/);
});
test('online message selects only pseudonymized document and refuses known canaries in instructions too',async()=>{
 const online=await import('data:text/javascript;base64,'+Buffer.from(fixture.artifacts({}).online.source).toString('base64'));
 const payload={document:{text:'LOCAL_MAPPING_CANARY'},mapping:{'[[TL_PERSON_0001]]':'LOCAL_MAPPING_CANARY'},localLlm:{text:'LOCAL_MAPPING_CANARY'},pseudonymizedText:'Text [[TL_PERSON_0001]]',privacy:{passed:true,requiredTerms:['LOCAL_MAPPING_CANARY']}};
 let sent,output;const tools={ai:{completeLogin:async args=>{sent=args;return {text:'Analysis [[TL_PERSON_0001]]'};}}};
 await online.run({input:{input:payload},config:{instructions:'Analyze protected text'},tools,log:async()=>{},emit:async(_p,d)=>{output=d;}});
 assert.ok(!JSON.stringify(sent).includes('LOCAL_MAPPING_CANARY'));assert.deepEqual(JSON.parse(sent.messages[1].content),{document:payload.pseudonymizedText});assert.deepEqual(output.mapping,payload.mapping);
 await assert.rejects(online.run({input:{input:payload},config:{instructions:'LOCAL_MAPPING_CANARY'},tools:{ai:{completeLogin:()=>assert.fail('Known canary in prompt must block')}},log:async()=>{},emit:async()=>{}}),/richiesta online non inviata/);
});
