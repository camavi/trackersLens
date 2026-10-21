import { run } from 'node:test';
import fs from 'node:fs';
import util from 'node:util';
const emit = value => fs.writeSync(3, JSON.stringify(value, function (key, item) {
  if (item instanceof Error) return Object.fromEntries(Object.getOwnPropertyNames(item).map(name => [name, item[name]]));
  if (typeof item === 'bigint') return { type: 'bigint', value: String(item) };
  return item;
}) + '\n');
let input = ''; for await (const chunk of process.stdin) input += chunk;
try {
  const config = JSON.parse(input);
  const escape = name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = (config.caseNames || []).map(name => new RegExp('^' + escape(name) + '$'));
  emit({ type: 'report_start', runner: 'node', version: process.version });
  let failed = false, count = 0; const ancestry = [];
  const stream = run({ files: config.files, concurrency: false, ...(patterns?.length ? { testNamePatterns: patterns } : {}) });
  for await (const event of stream) {
    try { emit({ type: 'native', event }); }
    catch (error) { emit({ type: 'serialization_error', error: error.message, representation: util.inspect(event, {depth:null,maxArrayLength:null,maxStringLength:null}) }); }
    if (event.type === 'test:start') { ancestry.length = event.data.nesting; ancestry[event.data.nesting] = event.data.name; }
    if (event.type === 'test:stdout') process.stdout.write(event.data.message);
    if (event.type === 'test:stderr') process.stderr.write(event.data.message);
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const data = event.data;
      const status = data.skip ? 'skipped' : data.todo ? 'todo' : event.type === 'test:fail' ? 'failed' : 'passed';
      if (status === 'failed') failed = true;
      emit({ type: 'case_result', caseId: String(++count), name: data.name, fullName: data.fullName || [...ancestry.slice(0,data.nesting),data.name].join(' '), file: data.file || null, line: data.line ?? null, column: data.column ?? null, kind: data.name === data.file && data.nesting === 0 ? 'file-or-test' : data.details?.type || 'test', status, durationMs: data.details?.duration_ms ?? null, details: data });
    }
  }
  emit({ type: 'report_end', success: !failed });
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  emit({ type: 'runner_error', error: {message:error.message,stack:error.stack} }); process.exitCode = 2;
}
