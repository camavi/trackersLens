const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAccountClient, normalizeOrigin } = require('../core/desktop/account-client.cjs');
const fixture = (responses = []) => {
  let saved = null;
  const calls = [];
  const cleared = [];
  const client = createAccountClient({
    persistence: {
      readDevelopmentRecordById: () => saved,
      writeDevelopmentRecords: ({ records }) => { saved = records[0]; },
    },
    sessionForOrigin: origin => ({
      cookies: { get: async () => [{ value: 'fixture%3Dtoken' }] },
      clearStorageData: async () => { cleared.push(origin); },
      fetch: async (url, options) => {
        calls.push({ url, ...options });
        return url.endsWith('/sanctum/csrf-cookie') ? new Response(null, { status: 204 }) : responses.shift();
      },
    }),
  });
  return { client, calls, cleared, saved: () => saved };
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const user = { id: 1, name: 'Fixture', email: 'fixture@example.test' };
test('account configuration is local and origin validation rejects credentials, remote HTTP and paths', async () => {
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'file:///tmp/test', 'https://example.com/api', 'https://example.com/?token=secret']) assert.throws(() => normalizeOrigin(url));
  assert.equal(normalizeOrigin('http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
  const f = fixture();
  assert.deepEqual(await f.client.dispatch('configuration'), { ok: true, data: { configured: false, baseUrl: '' } });
  assert.equal((await f.client.dispatch('user')).ok, false);
  assert.equal(f.calls.length, 0);
});
test('account login owns CSRF, uses exact configured origin and exposes only profile fields', async () => {
  const f = fixture([new Response(null, { status: 204 }), json({ ...user, password: 'hidden', token: 'hidden' })]);
  await f.client.dispatch('configure', { baseUrl: 'https://example.com' });
  const result = await f.client.dispatch('login', { email: user.email, password: 'secret', remember: true, path: '/arbitrary' });
  assert.equal(result.ok, true);
  assert.equal(result.data.email, user.email);
  assert.equal(result.data.password, undefined);
  assert.equal(result.data.token, undefined);
  assert.deepEqual(f.calls.map(call => new URL(call.url).pathname), ['/sanctum/csrf-cookie', '/api/login', '/api/user']);
  assert.equal(f.calls[1].headers['X-XSRF-TOKEN'], 'fixture=token');
  assert.equal(f.calls[1].headers.Origin, 'https://example.com');
  assert.equal(f.calls[1].redirect, 'error');
  assert.equal(JSON.parse(f.calls[1].body).path, undefined);
  assert.equal(JSON.stringify(f.saved()).includes('secret'), false);
});
test('validation errors survive IPC and CSRF retries once with a fresh cookie', async () => {
  const f = fixture([json({ message: 'Expired' }, 419), json({ message: 'Invalid', errors: { current_password: ['Incorrect password'] } }, 422)]);
  await f.client.dispatch('configure', { baseUrl: 'https://example.com' });
  const result = await f.client.dispatch('updatePassword', { current_password: 'old', password: 'new' });
  assert.equal(result.error.status, 422);
  assert.deepEqual(result.error.errors.current_password, ['Incorrect password']);
  assert.equal(f.calls.filter(call => call.url.endsWith('/sanctum/csrf-cookie')).length, 2);
});
test('logout preserves session on server failure and clears it after confirmed logout; switching origin isolates cookies', async () => {
  const f = fixture([json({ message: 'Down' }, 503), new Response(null, { status: 204 })]);
  await f.client.dispatch('configure', { baseUrl: 'https://example.com' });
  assert.equal((await f.client.dispatch('logout')).ok, false);
  assert.equal(f.cleared.length, 0);
  assert.equal((await f.client.dispatch('logout')).ok, true);
  assert.deepEqual(f.cleared, ['https://example.com']);
  await f.client.dispatch('configure', { baseUrl: 'https://another.example' });
  assert.equal(f.cleared.length, 2);
});
test('malformed successful responses cannot become authenticated user state', async () => {
  const f = fixture([json({ message: 'Not a user' })]);
  await f.client.dispatch('configure', { baseUrl: 'https://example.com' });
  assert.equal((await f.client.dispatch('user')).ok, false);
});
