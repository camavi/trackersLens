// Fifteenth acceptance phase, composed with the existing real-provider fixture.
// This SDK controller explicitly carries the observed error back to the LLM;
// no automatic event-bus cycle, retry policy or production scheduler is added.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

module.exports = async function repairAcceptance({ root, call, approve, install, create, wait, ids, pyManifest, generatedRef, generated, run, codex, rows, expected, policy }) {
  const runNode = async (nodeId, payload, timeout = 60000) => {
    const preview = await call('tl_preview_run_node', { workspaceId: 'qa', nodeId, inputs: { input: payload } });
    const started = await approve(call('tl_start_node_run', { planId: preview.planId }));
    let report;
    await wait(async () => { report = (await call('tl_get_node_run', { runId: started.runId })).run; return report.status !== 'running'; }, timeout);
    return report;
  };
  const migrate = async (source, target) => {
    const preview = await call('tl_preview_package_migration', { workspaceId: 'qa', nodeIds: [ids.generated], source, target });
    const result = await approve(call('tl_apply_package', { planId: preview.planId }));
    assert.equal(result.updated, 1);
    assert.equal((await call('tl_get_package_operation', { operationId: preview.operationId })).operation.status, 'completed');
    return result;
  };
  const output = report => report.result.events.find(e => e.kind === 'emit').data;
  const initialSource = codex.proposal.python_source;
  // Parse, never execute, the model source to locate the real run() body even
  // if its signature spans lines. The injected fault is source, not config.
  const bodyLine = Number(execFileSync('/usr/bin/python3', ['-c', 'import ast,sys\nt=ast.parse(sys.stdin.read())\nf=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=="run")\nprint(f.body[0].lineno)'], { input: initialSource, encoding: 'utf8' }).trim());
  const lines = initialSource.split('\n'), indent = lines[bodyLine - 1].match(/^[\t ]+/)?.[0];
  assert.ok(indent);
  lines.splice(bodyLine - 1, 0, indent + 'input["input"]["missing_rows"]');
  const faultySource = lines.join('\n');
  fs.writeFileSync(path.join(root, 'faulty-1.1.0.py'), faultySource);
  const generatedManifest = { ...pyManifest, id: 'custom.codex-generated', name: 'Codex generated Python', subtype: 'codex-generated' };
  const faultyRef = await install({ ...generatedManifest, version: '1.1.0' }, faultySource, generatedRef);
  const faultyMigration = await migrate(generatedRef, faultyRef);
  const failed = await runNode(ids.generated, { rows });
  assert.equal(failed.status, 'failed'); assert.equal(failed.reference.version, '1.1.0');
  assert.match(JSON.stringify(failed.result.diagnostics), /KeyError/);
  assert.match(JSON.stringify(failed.result.diagnostics), /missing_rows/);
  assert.equal(failed.result.provenance.isolation, 'macos-seatbelt');
  assert.deepEqual((await call('tl_get_node_run', { runId: generated.id })).run, generated);
  assert.deepEqual((await call('tl_get_node_run', { runId: run.id })).run, run);
  console.log('REAL PYTHON FAILURE OBSERVED', failed.id);

  const instructions = 'You are the repair LLM node in TL. You receive original.rows, the complete Gemma/Codex handoff, the exact broken Python source, exact package reference and full real failed run with traceback. Diagnose that observed failure and author a complete repaired Python program, preserving the explicit user policy: ' + policy + ' Return ONLY valid JSON without markdown fences: diagnosis (explain the observed exception and source cause), python_source (complete def run(*, input, config, emit, log): program reading input["input"]["rows"] and emitting exactly the policy fields on output). Use only Python standard-library arithmetic/math. No filesystem/network/process/tools/eval. Repair the source; do not change configuration, hardcode results, hide rows or install anything. Your new source is separately reviewed and versioned by MCP.';
  // Use the shared LLM package's exact activated reference from the real run.
  await create('repair', run.steps[1].reference, { role: 'repair', aiProviderId: 'qa-codex', instructions }, 1650);
  const before = await call('tl_inspect_workspace', { workspaceId: 'qa' });
  const payload = { ...codex, repair: { source: faultySource, reference: faultyRef, failedRun: failed, policy } };
  const repaired = await runNode(ids.repair, payload, Number(process.env.TL_LLM_QA_WAIT_MS || 600000));
  assert.equal(repaired.status, 'completed', JSON.stringify(repaired));
  const handoff = output(repaired);
  assert.deepEqual(handoff.repair.failedRun, failed); assert.deepEqual(handoff.repair.source, faultySource);
  assert.deepEqual(handoff.gemma, codex.gemma); assert.deepEqual(handoff.original, { rows });
  assert.equal(handoff.repairResponse.provenance.source, 'tl-core-login-ai');
  assert.equal(typeof handoff.repairProposal.python_source, 'string');
  assert.equal(typeof handoff.repairProposal.diagnosis, 'string');
  assert.notEqual(handoff.repairProposal.python_source, faultySource);
  const fixedSource = handoff.repairProposal.python_source;
  fs.writeFileSync(path.join(root, 'repaired-1.2.0.py'), fixedSource);
  const fixedRef = await install({ ...generatedManifest, version: '1.2.0' }, fixedSource, faultyRef);
  const fixedMigration = await migrate(faultyRef, fixedRef);
  const fixed = await runNode(ids.generated, { rows });
  assert.equal(fixed.status, 'completed', JSON.stringify(fixed)); assert.equal(fixed.reference.version, '1.2.0'); assert.deepEqual(output(fixed), expected);
  const edgeRows = [{ value: '8' }, { value: true }, { value: ' -2.5 ' }, { value: null }, { value: 'oops' }];
  const edge = await runNode(ids.generated, { rows: edgeRows });
  assert.equal(edge.status, 'completed', JSON.stringify(edge));
  assert.deepEqual(output(edge), { rows: edgeRows, count: 5, validCount: 2, validValues: [8, -2.5], total: 5.5, mean: 2.75, doubled: [16, -5], attention: [{ index: 1, reason: 'invalid' }, { index: 3, reason: 'missing' }, { index: 4, reason: 'invalid' }] });
  const empty = await runNode(ids.generated, { rows: [] });
  assert.equal(empty.status, 'completed', JSON.stringify(empty));
  assert.deepEqual(output(empty), { rows: [], count: 0, validCount: 0, validValues: [], total: 0, mean: null, doubled: [], attention: [] });
  const after = await call('tl_inspect_workspace', { workspaceId: 'qa' });
  for (const node of before.graph.tl_runtime_nodes) {
    const current = after.graph.tl_runtime_nodes.find(n => n.id === node.id);
    if (node.id !== ids.generated) assert.deepEqual(current, node);
    else assert.equal(current.metadata.customPackage.version, '1.2.0');
  }
  for (const store of ['tl_runtime_dependencies', 'tl_connections', 'tl_channels', 'tl_flows']) assert.deepEqual(after.graph[store], before.graph[store]);
  assert.deepEqual((await call('tl_get_node_run', { runId: failed.id })).run, failed);
  assert.deepEqual((await call('tl_get_node_run', { runId: generated.id })).run, generated);
  assert.deepEqual((await call('tl_get_node_run', { runId: run.id })).run, run);
  console.log('REAL CODEX REPAIR AND THREE INPUT SETS PASS', fixed.id);
  return { initialSource, faultySource, fixedSource, faultyRef, fixedRef, faultyMigration, fixedMigration, failed, repaired, fixed, edge, empty, before, after, payload };
};
