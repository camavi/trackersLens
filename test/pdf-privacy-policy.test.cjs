const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {pythonSource}=require('./fixtures/pdf-privacy-pipeline.cjs');
test('configured PDF text policy protects overlapping identifiers/numbers, restores exact Unicode and blocks failed or incomplete local audits',()=>{
 const code=pythonSource+`
text = 'INPS ISEE\\nCliente Mario Rossi CF RSSMRA80A01F205X\\nEmail mario@example.test\\nImporto 12.345,67 EUR\\nData 01/02/2024 — qualità Sezioni A1 MB.1 FC1 1A\\n'
data = {'document':{'text':text}, 'localLlm':{'text':json.dumps({'entities':[{'value':'Mario Rossi','type':'PERSON'},{'value':'RSSMRA80A01F205X','type':'TAX_ID'}]})}}
outputs = []
run(input={'input':data}, config={'parameters':{'mode':'mask'}}, emit=lambda port,value:outputs.append(value), log=lambda *args:None)
masked = outputs[0]
for value in ['Mario Rossi','RSSMRA80A01F205X','mario@example.test','12.345,67','01/02/2024']:
    assert value not in masked['pseudonymizedText']
restored = masked['pseudonymizedText']
for token,value in masked['mapping'].items():
    restored = restored.replace(token,value)
assert restored == text
assert not re.search(r'\\d|@', TOKEN.sub('', masked['pseudonymizedText']))
for audit in [{'text':'{"safe":false,"residualEntities":["private"]}'},{'text':'{"safe":true,"residualEntities":[]}', 'incomplete':True}]:
    emitted = []
    try:
        run(input={'input':{**masked,'localAudit':audit}},config={'parameters':{'mode':'verify'}},emit=lambda *args:emitted.append(args),log=lambda *args:None)
    except ValueError:
        pass
    else:
        raise AssertionError('Unsafe or incomplete audit must fail')
    assert not emitted
try:
    run(input={'input':{**data,'localLlm':{'text':'{"entities":['}}},config={'parameters':{'mode':'mask'}},emit=lambda *args:None,log=lambda *args:None)
except json.JSONDecodeError:
    pass
else:
    raise AssertionError('Malformed model JSON must not be silently repaired')
print('policy passed')
`;
 const result=spawnSync(process.env.TL_TEST_DATA_PYTHON||'python3',['-c',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/policy passed/);
});
test('PDF source supports persisted Play input and explicit input, rejects absent data and stale egress approval',()=>{
 const code=pythonSource+`
raw = b'%PDF-synthetic-fixture'
doc = {'text':'Documento sintetico','pdfBase64':base64.b64encode(raw).decode(),'pdfSha256':hashlib.sha256(raw).hexdigest(),'pageCount':1,'extraction':'synthetic'}
for input_value,params in [({}, {'mode':'source','document':doc}), ({'input':{'document':doc,'extra':1}}, {'mode':'source'})]:
    outputs=[]
    run(input=input_value,config={'parameters':params},emit=lambda port,value:outputs.append(value),log=lambda *args:None)
    assert outputs[0]['document'] == doc
try:
    run(input={},config={'parameters':{'mode':'source'}},emit=lambda *args:None,log=lambda *args:None)
except ValueError as error:
    assert 'Documento mancante' in str(error)
else:
    raise AssertionError('Missing source must be actionable')
text='[[TL_TEXT_000001]]'
data={'pseudonymizedText':text,'privacy':{'deterministicPassed':True},'localAudit':{'text':'{"safe":true,"residualEntities":[]}'}}
for approved,should_pass in [(hashlib.sha256(text.encode()).hexdigest(),True),('0'*64,False)]:
    outputs=[]
    try:
        run(input={'input':data},config={'parameters':{'mode':'verify','approvedProtectedTextSha256':approved}},emit=lambda port,value:outputs.append(value),log=lambda *args:None)
    except ValueError:
        assert not should_pass
    else:
        assert should_pass and outputs[0]['privacy']['passed']
`;
 const result=spawnSync(process.env.TL_TEST_DATA_PYTHON||'python3',['-c',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
