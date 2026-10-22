// Opt-in real-model acceptance. Node orchestrates two isolated Electron lifetimes.
// Requires an authenticated Codex CLI and the already verified managed data pack.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(predicate) {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error('Orders QA wait timed out');
}
function dataset() {
  const rows = Array.from({ length: 120 }, (_, index) => {
    const i = index + 1, quantity = 1 + i % 5, unit = 100 + i * 13;
    return { order_id: 'O' + (i % 17 === 0 ? i - 1 : i), customer: i % 19 === 0 ? '' : 'C' + (i % 11), currency: i % 3 === 0 ? 'USD' : 'EUR', quantity: String(quantity), unit_cents: String(unit), total_cents: String(quantity * unit + (i % 23 === 0 ? 37 : 0)) };
  });
  const csv = Object.keys(rows[0]).join(',') + '\n' + rows.map(row => Object.values(row).join(',')).join('\n') + '\n';
  return { rows, csv };
}
function oracle(rows) {
  const byCurrency = {}, seen = new Set(), anomalies = [];
  rows.forEach((row, rowIndex) => {
    const declared = Number(row.total_cents), expected = Number(row.quantity) * Number(row.unit_cents);
    const group = byCurrency[row.currency] ||= { count: 0, declaredCents: 0, expectedCents: 0 };
    group.count++; group.declaredCents += declared; group.expectedCents += expected;
    const reasons = [];
    if (seen.has(row.order_id)) reasons.push('duplicate_order_id');
    if (!row.customer) reasons.push('missing_customer');
    if (declared !== expected) reasons.push('total_mismatch');
    seen.add(row.order_id);
    if (reasons.length) anomalies.push({ rowIndex, reasons, row });
  });
  return { stats: { rowCount: rows.length, distinctOrders: seen.size, byCurrency }, quality: { rowCount: rows.length, anomalyCount: anomalies.length, anomalies } };
}
function emitted(step) {
  return step.result.events.find(event => event.kind === 'emit' && event.port === 'output')?.data
    ?? step.result.events.find(event => event.kind === 'emit')?.data;
}
function checkRun(run, nodes, data) {
  const byRole = Object.fromEntries(nodes.map(node => [node.metadata.config.role, node]));
  const step = role => run.steps.find(s => s.nodeId === byRole[role].id);
  assert.equal(run.steps.length, 3);
  assert.equal(run.deliveries.length, 2);
  assert.deepEqual(emitted(step('source')), { rows: data.rows });
  assert.deepEqual(emitted(step('quality')), oracle(data.rows).quality);
  for (const s of run.steps) {
    assert.equal(s.result.provenance.runtime, 'python');
    assert.equal(s.result.provenance.isolation, 'macos-seatbelt');
    const verification = s.result.events.find(e => e.kind === 'log' && e.message === 'Python modules verified');
    assert.deepEqual(verification.data.modules, { numpy: '2.2.6', pandas: '2.2.3' });
    assert.ok(s.trace.events.length);
  }
  if (run.status === 'failed') {
    assert.equal(step('stats').reference.version, '1.1.0');
    assert.match(JSON.stringify(step('stats').result.diagnostics), /missing_total_cents/);
    assert.match(JSON.stringify(step('stats').result.diagnostics), /KeyError/);
  } else {
    assert.equal(run.status, 'completed');
    assert.deepEqual(emitted(step('stats')), oracle(data.rows).stats);
  }
}
if (!process.versions.electron) {
  (async () => {
    const root = process.env.TL_MCP_ORDERS_QA_ROOT || fs.mkdtempSync('/tmp/tlo-');
    fs.mkdirSync(root, { recursive: true });
    const resume = process.env.TL_MCP_ORDERS_QA_RESUME === '1';
    assert.equal(fs.existsSync(path.join(root, 'project')), resume, 'Use a fresh QA root or explicitly resume the persisted build');
    if (resume) {
      // Recover QA verification only: no model rerun, package mutation or runtime replay.
      const { DatabaseSync } = require('node:sqlite');
      const saved = new DatabaseSync(path.join(root, 'project/.tl/workspace.sqlite'), { readOnly: true });
      const read = store => saved.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(row => JSON.parse(row.record_json));
      const nodes = read('tl_runtime_nodes'), runs = read('tl_ai_jobs').filter(j => j.kind === 'mcp-flow-run');
      assert.equal(runs.length, fs.existsSync(path.join(root, 'after-reopen.json')) ? 4 : 3); for (const run of runs) checkRun(run, nodes, dataset());
      assert.equal(fs.readFileSync(path.join(root, 'orders.csv'), 'utf8'), dataset().csv);
      assert.equal(fs.readdirSync(root).filter(file => /^review-\d+\.txt$/.test(file)).length, 12);
      if (!fs.existsSync(path.join(root, 'before-reopen.json'))) fs.writeFileSync(path.join(root, 'before-reopen.json'), JSON.stringify({ nodes, runs, dependencies: read('tl_runtime_dependencies'), packages: read('tl_packages') }, null, 2));
      saved.close();
    }
    fs.writeFileSync(path.join(root, 'orders.csv'), dataset().csv);
    for (const stage of (resume ? ['reopen'] : ['build', 'reopen'])) {
      const fd = fs.openSync(path.join(root, stage + '.log'), 'w');
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(require('electron'), [__filename, '--qa-root=' + root, '--qa-stage=' + stage], { env, stdio: ['ignore', fd, fd] });
      const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
      fs.closeSync(fd);
      assert.equal(result.code, 0, JSON.stringify(result) + '; inspect ' + path.join(root, stage + '.log'));
      assert.ok(fs.existsSync(path.join(root, stage === 'build' ? 'before-reopen.json' : 'after-reopen.json')), stage + ' exited without completing acceptance');
    }
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(root, 'project/.tl/workspace.sqlite'), { readOnly: true });
    const records = store => db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(row => JSON.parse(row.record_json));
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    const nodes = records('tl_runtime_nodes'), packages = records('tl_packages'), runs = records('tl_ai_jobs').filter(j => j.kind === 'mcp-flow-run');
    assert.equal(nodes.length, 3); assert.equal(packages.length, 3); assert.equal(runs.length, 4);
    assert.deepEqual(runs.map(r => r.status).sort(), ['completed', 'completed', 'completed', 'failed']);
    assert.deepEqual(Object.fromEntries(nodes.map(n => [n.metadata.config.role, n.metadata.customPackage.version])), { source: '1.0.0', stats: '1.2.0', quality: '1.0.0' });
    for (const run of runs) checkRun(run, nodes, dataset());
    const hash = require('node:crypto').createHash;
    const archiveFiles = [];
    const collect = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) collect(file); else archiveFiles.push(file); } };
    collect(path.join(root, 'project/custom-nodes'));
    for (const p of packages) {
      const file = archiveFiles.find(file => path.basename(file) === 'archive_' + p.archive.sha256 + '.tl-node.zip');
      assert.ok(file); assert.equal(hash('sha256').update(fs.readFileSync(file)).digest('hex'), p.archive.sha256);
    }
    const roles = Object.fromEntries(nodes.map(n => [n.metadata.config.role, n.id]));
    assert.deepEqual(records('tl_runtime_dependencies').map(e => [e.sourceNodeId, e.targetNodeId]).sort(), [[roles.source, roles.stats], [roles.source, roles.quality]].sort());
    assert.equal(records('tl_connections').length, 2);
    const snapshots = records('tl_time_travel_snapshots'), migrations = snapshots.filter(s => s.restoreMode === 'custom-node-migration');
    assert.equal(snapshots.length, 6); assert.equal(migrations.length, 2);
    assert.ok(migrations.every(s => s.state.runtimeNodes.length === 1 && s.state.runtimeNodes[0].id === roles.stats));
    const items = fs.readFileSync(path.join(root, 'codex.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.type === 'item.completed').map(e => e.item);
    assert.ok(items.every(item => ['mcp_tool_call', 'agent_message', 'reasoning'].includes(item.type)), 'External model used a non-MCP tool');
    const calls = items.filter(item => item.type === 'mcp_tool_call');
    assert.ok(calls.length); assert.ok(calls.every(item => item.server === 'trackersLens'));
    const summary = { passed: true, root, mcpCalls: calls.length, refusedCalls: calls.filter(i => i.status === 'failed').map(i => ({ tool: i.tool, error: i.result })), otherTools: [], rows: 120, expected: oracle(dataset().rows), runs: runs.map(r => ({ id: r.id, status: r.status })), packages: packages.map(p => ({ version: p.version, sha256: p.archive.sha256 })), migrations: migrations.length, snapshots: snapshots.length, realAppLifetimes: 2, managedPackReused: true, allRowsPreserved: true, reopenedExplicitRun: true };
    db.close(); fs.writeFileSync(path.join(root, 'independent-evidence.json'), JSON.stringify(summary, null, 2));
    console.log('MCP orders end-to-end acceptance PASS ' + root);
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
  const root = process.argv.find(a => a.startsWith('--qa-root=')).slice(10);
  const stage = process.argv.find(a => a.startsWith('--qa-stage=')).slice(11);
  const project = path.join(root, 'project');
  fs.mkdirSync(project, { recursive: true }); app.setPath('userData', path.join(root, 'profile'));
  process.argv.push('--tl-project=' + project); process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX = '1';
  app.on('before-quit', () => console.log('QA before-quit', stage));
  app.on('browser-window-created', (_, window) => window.on('close', () => console.log('QA window close', stage)));
  require('../electron/main.cjs');
  app.whenReady().then(async () => {
    let child, client;
    try {
      await wait(() => BrowserWindow.getAllWindows().some(w => !w.webContents.isLoading()));
      const win = BrowserWindow.getAllWindows()[0]; win.show();
      const js = code => win.webContents.executeJavaScript(code, true);
      const ui = async code => { try { return !win.webContents.isLoading() && await js(code); } catch { return false; } };
      const persistence = new DesktopPersistence({ databasePath: path.join(project, '.tl/workspace.sqlite') }); persistence.initialize();
      const read = storeName => persistence.readDevelopmentRecords({ storeName });
      if (stage === 'build') {
        assert.equal(read('tl_runtime_nodes').length, 0); assert.equal(read('tl_packages').length, 0);
        // Only an empty workspace shell is provisioned by QA; model authors every package/node/link.
        persistence.writeDevelopmentRecords({ storeName: 'tl_pages', records: [{ id: 'qa', workspaceId: 'qa', name: 'Orders quality lab', content: { kind: 'flowmap', name: 'Orders quality lab' } }] });
      }
      await wait(() => ui('Boolean(window.trackers?.desktop?.mcpServer)'));
      assert.equal((await js('window.trackers.desktop.mcpServer.status()')).running, false);
      const service = await js('window.trackers.desktop.mcpServer.start()');
      if (stage === 'build') {
        const node = execFileSync('/usr/bin/which', ['node'], { encoding: 'utf8' }).trim();
        const codex = process.env.TL_QA_CODEX || execFileSync('/usr/bin/which', ['codex'], { encoding: 'utf8' }).trim();
        const config = `mcp_servers.trackersLens={command=${JSON.stringify(node)},args=[${JSON.stringify(path.join(repo, 'scripts/tl-mcp.cjs'))},"--project",${JSON.stringify(project)}],tool_timeout_sec=180,tools.tl_start_node_run.approval_mode="approve",tools.tl_stop_node_run.approval_mode="approve",tools.tl_preview_package.approval_mode="approve",tools.tl_apply_package.approval_mode="approve"}`;
        const prompt = `Decimo test reale TL: crea un Flow utile di controllo ordini nel workspace vuoto qa usando SOLO tool MCP trackersLens. Niente shell/file/patch/browser o subagenti. Nessun nodo/pacchetto/collegamento è predisposto; l'operatore approva i dialoghi locali del solo progetto temporaneo. Scopri strumenti e template Python con tl_list_packages. Riusa il pack già verificato trackerslens.data.tabular (pandas2.2.3/numpy2.2.6, requisiti con ==, managed-required), senza download. Scrivi tu un pacchetto custom.mcp-orders-qa v1.0.0 publisherqa categoryprocessors subtypeorders-qa, inputs ['input'], outputs ['output'], permissions{}, runtime entryruntime.py modesandboxed, executionPython conforme al template, settingsSchema role string requiredtrue. Funzione def run(*, input, config, emit, log), importa e usa pandas e numpy. Ruoli source/stats/quality. Source riceve input['input']['csv'], usa csv.DictReader(io.StringIO(...)) per mantenere ogni campo esattamente STRINGA, compresi vuoti; emette output {'rows': [tutte le righe originali]}. Stats e quality ricevono input['input']['rows']. Stats emette ESATTAMENTE {rowCount:int,distinctOrders:int,byCurrency:{EUR:{count:int,declaredCents:int,expectedCents:int},USD:{count:int,declaredCents:int,expectedCents:int}}: tutte le righe contano, nessuna deduplicazione o correzione. declaredCents=sum(int(total_cents)); expectedCents=sum(int(quantity)*int(unit_cents)); mai mescolare valute, usare interi. Quality emette ESATTAMENTE {rowCount:int,anomalyCount:int,anomalies:[{rowIndex:int,reasons:[string],row:oggetto originale}]}: indice0-based, ordineoriginale; reasons in ordine duplicate_order_id (solo occorrenze SUCCESSIVE dello stesso order_id), missing_customer (stringavuota), total_mismatch (quantity*unit_cents!=total_cents). Non scartare/correggere o troncare dati. Logga ruolo e versioni moduli. Installa/consenti/attiva via preview/apply package e leggi operation. Crea TRE nodi inattivi via tl_preview_create_node/apply, config.role source/stats/quality. Collega source.output a stats.input e quality.input con graph preview/apply. Esegui primo Flow via preview_run_flow/start/get con inputs {input:{csv:CSV_ESATTO_QUI_SOTTO}}, attendi terminale e controlla dati. Poi crea v1.1.0 con baseReferencev1.0 e modifica SOLO Stats: accedi alla colonna frame['missing_total_cents'] nel calcolo declaredCents al posto di total_cents, generando vero KeyError. Non config.fail o errore simulato. Installa nuova versione e migra SOLO il nodo stats1.0->1.1 via preview_package_migration/apply. Esegui secondo Flow identico: failed, stats KeyError, quality deve comunque completare con tutte anomalie. Poi crea v1.2.0 base1.1 correggendo quel difetto; installa e migra SOLO stats1.1->1.2. Terzo Flow stesso CSV deve completare. Rileggi il run fallito per verificare diagnosi e ref1.1 conservati; verifica source/quality1.0 e stats1.2, stessi ID/collegamenti. Non avviare run extra o nodi singoli. Se una risposta è incerta leggi operationId/runId/receipt senza ripetere automaticamente. Concludi con runId e risultati. Ecco il CSV sintetico autorizzato, delimitato fra marker:\nBEGIN_CSV\n${dataset().csv}END_CSV`;
        fs.writeFileSync(path.join(root, 'prompt.txt'), prompt);
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
        child = spawn(codex, ['exec', '--ignore-user-config', '--skip-git-repo-check', '--ephemeral', '--json', '--sandbox', 'read-only', '--disable', 'shell_tool', '--disable', 'hooks', '-C', project, '-c', config, '-o', path.join(root, 'answer.txt'), '-'], { cwd: project, env, stdio: ['pipe', 'pipe', 'pipe'] });
        child.stdout.pipe(fs.createWriteStream(path.join(root, 'codex.jsonl'))); child.stderr.pipe(fs.createWriteStream(path.join(root, 'codex.stderr'))); child.stdin.end(prompt);
        let done = false, exitCode, lastReview = '', reviews = 0;
        child.once('error', error => { console.error(error); done = true; exitCode = 1; });
        child.once('exit', code => { done = true; exitCode = code; });
        const deadline = Date.now() + 25 * 60 * 1000;
        while (!done && Date.now() < deadline) {
          const review = await ui("document.querySelector('.tl-mcp-edit-review')?.textContent||''");
          if (review && review !== lastReview) {
            lastReview = review; reviews++; console.log('Local QA review', reviews);
            fs.writeFileSync(path.join(root, 'review-' + reviews + '.txt'), review);
            await ui("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>['Avvia Flow MCP','Applica modifica MCP','Applica pacchetto MCP'].includes(b.textContent)).click()");
          } else if (!review) lastReview = '';
          await delay(500);
        }
        if (!done) throw new Error('External model acceptance timed out');
        assert.equal(exitCode, 0); assert.equal(reviews, 12);
        const nodes = read('tl_runtime_nodes'), runs = read('tl_ai_jobs').filter(j => j.kind === 'mcp-flow-run');
        assert.equal(runs.length, 3); for (const run of runs) checkRun(run, nodes, dataset());
        fs.writeFileSync(path.join(root, 'before-reopen.json'), JSON.stringify({ nodes, runs, dependencies: read('tl_runtime_dependencies'), packages: read('tl_packages') }, null, 2));
        console.log('External model build/error/fix checked');
      } else {
        const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
        client = new Client({ name: 'orders-reopen-independent', version: '1' });
        await client.connect(new StdioClientTransport({ ...service.configuration.mcpServers.trackersLens, stderr: 'pipe' }));
        const call = async (name, args = {}) => { const result = await client.callTool({ name, arguments: args }); assert.equal(result.isError, undefined, JSON.stringify(result)); return result.structuredContent; };
        const before = JSON.parse(fs.readFileSync(path.join(root, 'before-reopen.json')));
        const ordered = records => [...records].sort((a, b) => a.id.localeCompare(b.id));
        assert.deepEqual(ordered(read('tl_runtime_nodes')), ordered(before.nodes)); assert.deepEqual(ordered(read('tl_packages')), ordered(before.packages)); assert.deepEqual(ordered(read('tl_runtime_dependencies')), ordered(before.dependencies));
        const alreadyRun = fs.existsSync(path.join(root, 'after-reopen.json'));
        assert.equal(read('tl_ai_jobs').filter(j => j.kind === 'mcp-flow-run').length, alreadyRun ? 4 : 3, 'Reopening must not replay runs');
        for (const run of before.runs) assert.deepEqual((await call('tl_get_node_run', { runId: run.id })).run, run);
        if (!alreadyRun) {
        const source = before.nodes.find(n => n.metadata.config.role === 'source');
        const plan = await call('tl_preview_run_flow', { workspaceId: 'qa', startNodeId: source.id, inputs: { input: { csv: dataset().csv } } });
        const pending = call('tl_start_node_run', { planId: plan.planId });
        await wait(() => ui("Boolean(document.querySelector('.tl-mcp-edit-review'))"));
        await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>b.textContent==='Avvia Flow MCP').click()");
        const started = await pending; let report;
        await wait(async () => { report = await call('tl_get_node_run', { runId: started.runId }); return report.run.status !== 'running'; });
        checkRun(report.run, before.nodes, dataset());
        assert.equal(report.run.status, 'completed');
        fs.writeFileSync(path.join(root, 'after-reopen.json'), JSON.stringify(report, null, 2));
        }
        console.log('Reopen preserved history and explicit fresh execution PASS');
        await win.loadFile(path.join(repo, 'app.html'), { query: { 'tl-route': 'flowMap.html', workspaceId: 'qa' } });
        await delay(1500);
        fs.writeFileSync(path.join(root, 'flow-loaded.png'), (await win.webContents.capturePage()).toPNG());
        fs.writeFileSync(path.join(root, 'flow-loaded.json'), JSON.stringify(await js("({url:location.href,text:document.body.innerText})"), null, 2));
        await wait(() => ui("document.querySelectorAll('[data-flow-node-id]').length===3"));
        await js("document.querySelector('button[aria-label=\"Fit view\"]')?.click()");
        await delay(400);
        assert.equal(await js("document.body.innerText.includes('values.filter is not a function')"), false);
        fs.writeFileSync(path.join(root, 'flow-reopened.png'), (await win.webContents.capturePage()).toPNG());
        const visible = await js("[...document.querySelectorAll('[data-flow-node-id]')].map(n=>({id:n.dataset.flowNodeId,text:n.querySelector('.tl-flow-node-title')?.textContent}))");
        fs.writeFileSync(path.join(root, 'visible-nodes.json'), JSON.stringify(visible, null, 2));
        await client.close(); client = null;
      }
      await wait(() => ui('Boolean(window.trackers?.desktop?.mcpServer)'));
      await js('window.trackers.desktop.mcpServer.stop()'); app.quit();
    } catch (error) {
      console.error(error); child?.kill('SIGTERM'); await client?.close();
      app.once('will-quit', event => { event.preventDefault(); app.exit(1); }); app.quit();
    }
  });
}
