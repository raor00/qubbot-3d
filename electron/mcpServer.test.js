// Tests for the local MCP server: protocol, tool validation, secret filter and the network guard.
// Run with `npm test` (node:test, no dependencies).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMcpHandler, startMcpServer, isBlockedPath, isBlockedRealPath, isInScope, TOOLS } = require('./mcpServer');
const lab = require('./lab');

const LAB_WRITE = lab.LAB_WRITE_TOOLS.map((n) => `platanus_${n}`);

const calls = [];
const handlers = {
  platanus_get_project: async () => ({ name: 'demo', tree: ['src/', 'src/app.ts'] }),
  platanus_list_risks: async () => [{ path: '.env', level: 'red' }],
  platanus_read_file: async ({ path }) => `contents of ${path}`,
  platanus_write_file: async ({ path }) => `wrote ${path}`,
  platanus_set_file_score: async ({ path, level }) => `${path} -> ${level}`,
  platanus_show_folder: async ({ path }) => `showing ${path || 'map'}`,
  platanus_lab_catalog: async () => 'catalog',
  platanus_lab_view: async () => 'bench',
  platanus_lab_add_part: async ({ type }) => `added ${type}`,
  platanus_lab_connect: async ({ from, to }) => `${from} -> ${to}`,
  platanus_lab_auto_wire: async () => 'wired',
  platanus_lab_remove: async () => 'removed',
};
const respond = createMcpHandler({ handlers, onCall: (c) => calls.push(c) });

test('initialize and tools/list', async () => {
  const init = await respond({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const list = await respond({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
});

test('notifications get no reply; unknown methods are JSON-RPC errors', async () => {
  assert.equal(await respond({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const r = await respond({ jsonrpc: '2.0', id: 3, method: 'nope' });
  assert.equal(r.error.code, -32601);
});

test('every tool call is reported for the audit log', async () => {
  calls.length = 0;
  await respond({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'platanus_show_folder', arguments: { path: 'src' } } });
  assert.deepEqual(calls.map((c) => [c.tool, c.ok]), [['platanus_show_folder', true]]);
});

test('secrets are never read, even if the agent asks', async () => {
  for (const p of ['.env', 'config/.env.local', 'certs/server.pem', 'keys/id_rsa', 'a/b.key',
    '.env/', './.env/.', 'x/../.env/', '.git/config', 'a/.ssh/id_ed25519', '.npmrc', 'sub/.aws/credentials',
    'config/credentials.json', 'secrets.yml', '.htpasswd', 'gcp/service-account-prod.json']) {
    assert.equal(isBlockedPath(p), true, p);
    const r = await respond({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'platanus_read_file', arguments: { path: p } } });
    assert.equal(r.result.isError, true, p);
  }
  for (const p of ['.env.example', 'src/env.ts', 'README.md']) assert.equal(isBlockedPath(p), false, p);
});

test('invalid traffic light level and missing arguments are refused', async () => {
  const bad = await respond({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'platanus_set_file_score', arguments: { path: 'a', level: 'purple', reason: 'x' } } });
  assert.equal(bad.result.isError, true);
  const missing = await respond({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'platanus_read_file', arguments: {} } });
  assert.equal(missing.result.isError, true);
});

test('HTTP: answers local clients, refuses browsers (Origin) and foreign hosts', async () => {
  const token = 'a'.repeat(48);
  const server = await startMcpServer({ port: 0, handlers, token });
  const { port } = server.address();
  const post = (headers, path = `/mcp/${token}`) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
  try {
    assert.equal((await post({})).status, 200);
    // Without the private key in the address, another program on this computer gets nothing
    assert.equal((await post({}, '/mcp')).status, 404);
    assert.equal((await post({}, `/mcp/${'b'.repeat(48)}`)).status, 404);
    assert.equal((await post({ Origin: 'https://evil.example' })).status, 403);
    // fetch() silently ignores a custom Host header, so use http.request for the DNS-rebinding case
    const status = await new Promise((resolve, reject) => {
      const req = require('node:http').request(
        { host: '127.0.0.1', port, path: `/mcp/${token}`, method: 'POST', headers: { Host: `evil.example:${port}`, 'Content-Type': 'application/json' } },
        (res) => resolve(res.statusCode),
      );
      req.on('error', reject);
      req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    });
    assert.equal(status, 403);
  } finally {
    server.close();
  }
});

test('templates are readable; writes to secrets are refused too', async () => {
  assert.equal(isBlockedPath('.env.example'), false);
  assert.equal(isBlockedPath('src/app.js'), false);
  const r = await respond({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'platanus_write_file', arguments: { path: '.env', content: 'x', reason: 'r' } } });
  assert.equal(r.result.isError, true);
});

test('symlinks: a harmless-looking path that lands in .git/ or a secret is refused, even for new files', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-')));
  fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
  fs.symlinkSync(path.join(root, '.git'), path.join(root, 'cfg'));
  fs.symlinkSync(path.join(root, '.env'), path.join(root, 'notes.txt'));
  fs.mkdirSync(path.join(root, 'src'));
  assert.equal(await isBlockedRealPath(root, path.join(root, 'cfg/hooks/pre-commit')), true); // new file
  assert.equal(await isBlockedRealPath(root, path.join(root, 'notes.txt')), true);
  assert.equal(await isBlockedRealPath(root, path.join(root, 'src/new/app.js')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('read-only (the tour): only the reading tools are listed and nothing can be changed', async () => {
  const seen = [];
  const ro = createMcpHandler({ handlers, readOnly: true, onCall: (c) => seen.push(c) });
  const list = await ro({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['platanus_get_project', 'platanus_list_risks', 'platanus_read_file', 'platanus_lab_catalog', 'platanus_lab_view']);
  for (const name of ['platanus_write_file', 'platanus_set_file_score', 'platanus_show_folder', ...LAB_WRITE]) {
    const r = await ro({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: { path: 'a.js', content: 'x', reason: 'r', level: 'red' } } });
    assert.equal(r.result.isError, true, name);
    assert.match(r.result.content[0].text, /read-only/);
  }
  assert.ok(seen.every((c) => c.ok === false && c.error === 'read-only'));
  const read = await ro({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'platanus_read_file', arguments: { path: 'src/app.ts' } } });
  assert.equal(read.result.isError, false);
});

test('HTTP: the read-only address needs the same private key', async () => {
  const token = 'c'.repeat(48);
  const server = await startMcpServer({ port: 0, handlers, token });
  const { port } = server.address();
  const list = (path) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  try {
    const ro = await (await list(`/mcp/${token}/ro`)).json();
    assert.equal(ro.result.tools.length, 5);
    const full = await (await list(`/mcp/${token}`)).json();
    assert.equal(full.result.tools.length, TOOLS.length);
    assert.equal((await list(`/mcp/${'d'.repeat(48)}/ro`)).status, 404);
    assert.equal((await list(`/mcp/${token}/rw`)).status, 404);
  } finally {
    server.close();
  }
});

// --- Qubi's team: each worker has its own address and may only write inside its folders ---

function workerProject() {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-worker-')));
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'api'), { recursive: true });
  // a harmless-looking folder inside the worker's folder that really leads to another one
  fs.symlinkSync(path.join(root, 'apps', 'api'), path.join(root, 'apps', 'web', 'shared'));
  // a scope folder that is itself a link out of the project
  const away = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-away-')));
  fs.symlinkSync(away, path.join(root, 'apps', 'out'));
  return { root, cleanup: () => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(away, { recursive: true, force: true }); } };
}

test('isInScope: only relative paths inside one of the folders, also where they really land', async () => {
  const { root, cleanup } = workerProject();
  const scope = { folders: ['apps/web'], root };
  try {
    for (const p of ['apps/web/index.html', './apps/web/src/new/app.js', 'apps/web/./a.css']) {
      assert.equal(await isInScope(p, scope), true, p);
    }
    for (const p of ['apps/api/x.js', 'apps/webx/a.js', 'apps/web', 'apps/web/', 'Apps/web/a.js', 'APPS/WEB/a.js',
      '../apps/web/a.js', 'apps/web/../api/x.js', 'apps/web/../../x', '/etc/passwd', `${root}/apps/web/a.js`,
      'C:/apps/web/a.js', 'apps\\web\\..\\api\\x.js', '', 'apps/web/shared/x.js', 'apps/web/shared/new/x.js']) {
      assert.equal(await isInScope(p, scope), false, p);
    }
    // without the project root only the written path is checked
    assert.equal(await isInScope('apps/web/a.js', { folders: ['apps/web/'] }), true);
    assert.equal(await isInScope('apps/web/a.js', { folders: [] }), false);
    assert.equal(await isInScope('apps/web/a.js', { folders: ['..'] }), false);
    assert.equal(await isInScope('x/a.js', { folders: ['.'] }), false);
    assert.equal(await isInScope('apps/out/a.js', { folders: ['apps/out'], root }), false);
  } finally {
    cleanup();
  }
});

test('worker scope (handler): write inside is fine, outside / ".." / secrets are refused; the worker id reaches the handlers', async () => {
  const { root, cleanup } = workerProject();
  const seen = [];
  const logged = [];
  const spy = { ...handlers, platanus_write_file: async (args, context) => { seen.push([args.path, context]); return `wrote ${args.path}`; },
    platanus_read_file: async (args, context) => { seen.push([args.path, context]); return 'x'; } };
  const w = createMcpHandler({ handlers: spy, onCall: (c) => logged.push(c), scope: { folders: ['apps/web'], root }, context: { worker: 'w1-abcd' } });
  const write = (p) => w({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'platanus_write_file', arguments: { path: p, content: 'x', reason: 'r' } } });
  try {
    const ok = await write('apps/web/index.html');
    assert.equal(ok.result.isError, false);
    assert.deepEqual(seen, [['apps/web/index.html', { worker: 'w1-abcd' }]]);
    for (const p of ['apps/api/server.js', '../outside.js', 'apps/web/../api/x.js', 'apps/web/shared/x.js']) {
      const r = await write(p);
      assert.equal(r.result.isError, true, p);
      assert.match(r.result.content[0].text, /apps\/web\//, p); // the agent is told where it may write
    }
    const secret = await write('apps/web/.env');
    assert.equal(secret.result.isError, true);
    assert.match(secret.result.content[0].text, /secrets/);
    assert.equal(seen.length, 1); // no refused write reached main
    assert.ok(logged.filter((c) => !c.ok).every((c) => c.worker === 'w1-abcd'));
    // reading is not limited to the folder (as on the full address)
    const read = await w({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'platanus_read_file', arguments: { path: 'apps/api/server.js' } } });
    assert.equal(read.result.isError, false);
    assert.deepEqual(seen.at(-1), ['apps/api/server.js', { worker: 'w1-abcd' }]);
  } finally {
    cleanup();
  }
});

test('worker scope: the traffic light is not offered and setting it is refused (Qubi audits, not the worker)', async () => {
  const seen = [];
  const w = createMcpHandler({ handlers: { ...handlers, platanus_set_file_score: async (args) => { seen.push(args); return 'ok'; } },
    scope: { folders: ['apps/web'] }, context: { worker: 'w1-abcd' } });
  const list = await w({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.ok(!list.result.tools.some((tool) => tool.name === 'platanus_set_file_score'));
  assert.ok(list.result.tools.some((tool) => tool.name === 'platanus_write_file'));
  for (const p of ['apps/web/password.js', 'apps/api/server.js']) {
    const r = await w({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'platanus_set_file_score', arguments: { path: p, level: 'green', reason: 'ok' } } });
    assert.equal(r.result.isError, true, p);
  }
  assert.deepEqual(seen, []);
  // the full address keeps it
  const full = createMcpHandler({ handlers });
  const ok = await full({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'platanus_set_file_score', arguments: { path: 'a', level: 'green', reason: 'x' } } });
  assert.equal(ok.result.isError, false);
});

test('full address: handlers get an empty context (no worker)', async () => {
  const seen = [];
  const r = createMcpHandler({ handlers: { ...handlers, platanus_show_folder: async (args, context) => { seen.push(context); return 'ok'; } } });
  await r({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'platanus_show_folder', arguments: { path: '' } } });
  assert.deepEqual(seen, [{}]);
});

test('HTTP: a worker address exists only while it has a scope, and limits its writes', async () => {
  const { root, cleanup } = workerProject();
  const token = 'e'.repeat(48);
  const writes = [];
  const scopes = { 'w1-abcd': { folders: ['apps/web'], root }, 'w2-zzzz': null };
  const server = await startMcpServer({
    port: 0, token,
    handlers: { ...handlers, platanus_write_file: async ({ path: p }, context) => { writes.push([p, context.worker]); return 'ok'; } },
    scopeFor: (id) => scopes[id] ?? null,
  });
  const { port } = server.address();
  const call = (urlPath, name = 'platanus_write_file', args = { path: 'apps/web/a.js', content: 'x', reason: 'r' }) =>
    fetch(`http://127.0.0.1:${port}${urlPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  try {
    assert.equal(server.workerUrl('w1-abcd'), `http://127.0.0.1:${port}/mcp/${token}/w/w1-abcd`);
    const inside = await (await call(new URL(server.workerUrl('w1-abcd')).pathname)).json();
    assert.equal(inside.result.isError, false);
    const outside = await (await call(`/mcp/${token}/w/w1-abcd`, 'platanus_write_file', { path: 'apps/api/a.js', content: 'x', reason: 'r' })).json();
    assert.equal(outside.result.isError, true);
    assert.deepEqual(writes, [['apps/web/a.js', 'w1-abcd']]);
    // the full address keeps writing anywhere, without a worker
    await call(`/mcp/${token}`, 'platanus_write_file', { path: 'apps/api/a.js', content: 'x', reason: 'r' });
    assert.deepEqual(writes.at(-1), ['apps/api/a.js', undefined]);
    // no scope, invalid id, wrong key or extra path -> the address does not exist
    for (const p of [`/mcp/${token}/w/w2-zzzz`, `/mcp/${token}/w/w9-nope`, `/mcp/${token}/w/w4-abcd`, `/mcp/${token}/w/W1-abcd`,
      `/mcp/${token}/w/w1-ab`, `/mcp/${token}/w/w1-abcdefghijklm`, `/mcp/${token}/w/`, `/mcp/${token}/w/w1-abcd/`,
      `/mcp/${token}/w/w1-abcd/ro`, `/mcp/${'f'.repeat(48)}/w/w1-abcd`, `/mcp/${token}/w/../w1-abcd`]) {
      assert.equal((await call(p)).status, 404, p);
    }
    assert.equal(writes.length, 2);
    // the read-only address is unchanged
    const ro = await (await call(`/mcp/${token}/ro`)).json();
    assert.equal(ro.result.isError, true);
  } finally {
    server.close();
    cleanup();
  }
});

test('HTTP: without scopeFor there are no worker addresses', async () => {
  const token = 'g'.repeat(48);
  const server = await startMcpServer({ port: 0, handlers, token });
  const { port } = server.address();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/mcp/${token}/w/w1-abcd`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
    assert.equal(r.status, 404);
  } finally {
    server.close();
  }
});

test('commands and deletions: offered to the agent, refused to a worker and to the tour; a deletion of a secret is refused', async () => {
  const calls = [];
  const h = createMcpHandler({
    handlers: { ...handlers, platanus_run_command: async () => 'ran', platanus_delete_file: async () => 'deleted' },
    onCall: (c) => calls.push(c),
  });
  const list = await h({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const names = list.result.tools.map((t) => t.name);
  assert.ok(names.includes('platanus_run_command') && names.includes('platanus_delete_file'));
  const run = await h({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'platanus_run_command', arguments: { command: 'npm install', reason: 'Instalar' } } });
  assert.equal(run.result.content[0].text, 'ran');
  const secret = await h({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'platanus_delete_file', arguments: { path: '.env', reason: 'x' } } });
  assert.equal(secret.result.isError, true, 'a secret file is never touched');
  const worker = createMcpHandler({ handlers: { ...handlers, platanus_run_command: async () => 'ran' }, scope: { folders: ['web'] } });
  const w = await worker({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'platanus_run_command', arguments: { command: 'npm i', reason: 'x' } } });
  assert.equal(w.result.isError, true, 'a worker of the team runs nothing');
  const ro = createMcpHandler({ handlers, readOnly: true });
  const r = await ro({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'platanus_run_command', arguments: { command: 'npm i', reason: 'x' } } });
  assert.equal(r.result.isError, true);
});

test('lab tools: the six are declared, the read ones are on the read-only address, a worker cannot change the bench', async () => {
  assert.deepEqual(TOOLS.filter((t) => t.name.startsWith('platanus_lab_')).map((t) => t.name), lab.LAB_TOOLS.map((n) => `platanus_${n}`));
  const call = (h, name, args = {}) => h({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const full = createMcpHandler({ handlers });
  assert.equal((await call(full, 'platanus_lab_add_part', { type: 'led' })).result.content[0].text, 'added led');
  assert.equal((await call(full, 'platanus_lab_connect', { from: 'led-1.SIG', to: 'arduino-uno-1.D2' })).result.content[0].text, 'led-1.SIG -> arduino-uno-1.D2');
  assert.equal((await call(full, 'platanus_lab_view')).result.isError, false);
  // required arguments are checked before the handler
  assert.equal((await call(full, 'platanus_lab_add_part', {})).result.isError, true);
  assert.equal((await call(full, 'platanus_lab_connect', { from: 'a.b' })).result.isError, true);
  // the read-only address: reading works, changing is refused
  const seen = [];
  const ro = createMcpHandler({ handlers, readOnly: true, onCall: (c) => seen.push(c) });
  assert.equal((await call(ro, 'platanus_lab_catalog')).result.isError, false);
  assert.equal((await call(ro, 'platanus_lab_view')).result.isError, false);
  for (const name of LAB_WRITE) {
    const r = await call(ro, name, { type: 'led', from: 'a.b', to: 'c.d' });
    assert.equal(r.result.isError, true, name);
    assert.match(r.result.content[0].text, /read-only/);
  }
  // a worker of the team reads the bench but never changes it
  const worker = createMcpHandler({ handlers, scope: { folders: ['web'] }, context: { worker: 'w1-abcd' }, onCall: (c) => seen.push(c) });
  const names = (await worker({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools.map((t) => t.name);
  assert.ok(names.includes('platanus_lab_view') && names.includes('platanus_lab_catalog'));
  for (const name of LAB_WRITE) {
    assert.ok(!names.includes(name), name);
    const r = await call(worker, name, { type: 'led', from: 'a.b', to: 'c.d' });
    assert.equal(r.result.isError, true, name);
    assert.match(r.result.content[0].text, /lab bench/);
  }
  assert.equal((await call(worker, 'platanus_lab_view')).result.isError, false);
});
