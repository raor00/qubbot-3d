const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createElevenLabsLogin, sweepLogins, statusOf } = require('./elevenlabsLogin');

// Keys are built at run time: written out, they would trip the repo's own credential scan
const KEY = ['sk', '0123456789abcdef0123456789abcdef0123456789ab171e'].join('_');
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'el-login-'));
const loginFolders = (dir) => fs.readdirSync(dir).filter((name) => name.startsWith('elevenlabs-login-'));

// A stand-in for child_process.spawn running the ElevenLabs CLI. `behave(child, envPath)` plays the CLI.
function fakeSpawn(behave) {
  const runs = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = [];
    child.kill = (signal) => { child.killed.push(signal); if (!child.ignoreKill) setImmediate(() => child.emit('close', null, signal)); return true; };
    const envPath = args[args.indexOf('--env-path') + 1].replace(/^"|"$/g, '');
    runs.push({ command, args, options, child, envPath, folderMode: fs.statSync(path.dirname(envPath)).mode & 0o777 });
    setImmediate(() => behave(child, envPath));
    return child;
  };
  spawn.runs = runs;
  return spawn;
}
// The CLI that works: writes the env file, prints its JSON status and exits 0
const signsIn = (child, envPath) => {
  fs.writeFileSync(envPath, `# written by the CLI\nELEVENLABS_API_KEY=${KEY}\n`);
  child.stdout.emit('data', 'Opening your browser…\n');
  child.stdout.emit('data', `${JSON.stringify({ key_status: 'created', next: 'done', api_key: KEY })}\n`);
  child.emit('close', 0);
};
const saver = () => {
  const saved = [];
  const saveKey = async (key) => { saved.push(key); return { ok: true, last4: key.slice(-4) }; };
  saveKey.saved = saved;
  return saveKey;
};

test('signs in: runs the CLI in a private folder, saves the key and deletes the file and the folder', async () => {
  const dir = tmpDir();
  const spawn = fakeSpawn(signsIn);
  const saveKey = saver();
  const logged = [];
  const login = createElevenLabsLogin({ dir, spawn, saveKey, log: (info) => logged.push(info), env: { PATH: '/bin', ELEVENLABS_API_KEY: 'old' } });
  assert.deepEqual(await login.login(), { ok: true, last4: '171e' });
  assert.deepEqual(saveKey.saved, [KEY]);

  const [{ command, args, options, envPath, folderMode }] = spawn.runs;
  assert.match(command, /^npx(\.cmd)?$/);
  assert.deepEqual(args.slice(0, 5), ['-y', '@elevenlabs/cli@latest', 'onboard', 'connect', '--env-path']);
  assert.deepEqual(args.slice(6), ['--via', 'platanus/1.0', '--format', 'json']);
  assert.equal(path.basename(envPath), 'elevenlabs-login.env');
  assert.equal(path.dirname(path.dirname(envPath)), dir, 'inside the app folder');
  if (process.platform !== 'win32') assert.equal(folderMode.toString(8), '700');
  assert.equal(options.env.ELEVENLABS_API_KEY, undefined, 'the CLI must really sign in');
  if (process.platform !== 'win32') {
    // opened from Finder the app has launchd's short PATH: npx from Homebrew or ~/.local must still be found
    const dirs = options.env.PATH.split(path.delimiter);
    for (const extra of [path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin']) assert.ok(dirs.includes(extra), extra);
    assert.equal(dirs.at(-1), '/bin', 'the inherited PATH is kept, after them');
    assert.equal(options.detached, true, 'its own process group, so a kill reaches the node under npx');
  } else {
    assert.equal(options.env.PATH, '/bin');
  }

  assert.ok(!fs.existsSync(envPath), 'the key file is deleted');
  assert.ok(!fs.existsSync(path.dirname(envPath)), 'and its folder');
  assert.deepEqual(loginFolders(dir), []);
  // only the status fields are logged, never the output or the key
  assert.ok(!JSON.stringify(logged).includes(KEY));
  assert.deepEqual(logged, [{ key_status: 'created', next: 'done' }, { reason: 'ok' }]);
});

test('the file and the folder are deleted even when saving the key fails', async () => {
  for (const saveKey of [async () => ({ ok: false, error: 'shape' }), async () => { throw new Error('keychain'); }]) {
    const dir = tmpDir();
    const spawn = fakeSpawn(signsIn);
    assert.deepEqual(await createElevenLabsLogin({ dir, spawn, saveKey }).login(), { ok: false, reason: 'failed' });
    assert.ok(!fs.existsSync(spawn.runs[0].envPath));
    assert.deepEqual(loginFolders(dir), []);
  }
});

test('a CLI that ends without a key, or fails, is "failed"; the file is gone either way', async () => {
  const cases = [
    (child) => child.emit('close', 1),
    (child, envPath) => { fs.writeFileSync(envPath, 'OTHER=1\n'); child.emit('close', 0); },
    (child, envPath) => { fs.writeFileSync(envPath, 'ELEVENLABS_API_KEY=\n'); child.emit('close', 0); },
    (child) => child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' })),
  ];
  for (const behave of cases) {
    const dir = tmpDir();
    const saveKey = saver();
    assert.deepEqual(await createElevenLabsLogin({ dir, spawn: fakeSpawn(behave), saveKey }).login(), { ok: false, reason: 'failed' });
    assert.deepEqual(saveKey.saved, []);
    assert.deepEqual(loginFolders(dir), []);
  }
  // a key written even though the CLI exits with an error still counts (its exit code is not trusted)
  const dir = tmpDir();
  const late = (child, envPath) => { fs.writeFileSync(envPath, `ELEVENLABS_API_KEY=${KEY}\n`); child.emit('close', 2); };
  assert.deepEqual(await createElevenLabsLogin({ dir, spawn: fakeSpawn(late), saveKey: saver() }).login(), { ok: true, last4: '171e' });
});

test('without Node (npx not found): no-node', async () => {
  const dir = tmpDir();
  const spawn = fakeSpawn((child) => child.emit('error', Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' })));
  assert.deepEqual(await createElevenLabsLogin({ dir, spawn, saveKey: saver() }).login(), { ok: false, reason: 'no-node' });
  assert.deepEqual(loginFolders(dir), []);
});

test('cancel kills the CLI and answers cancelled; the file is deleted', async () => {
  const dir = tmpDir();
  const spawn = fakeSpawn((child, envPath) => fs.writeFileSync(envPath, `ELEVENLABS_API_KEY=${KEY}\n`)); // waits for the browser
  const saveKey = saver();
  const login = createElevenLabsLogin({ dir, spawn, saveKey });
  const pending = login.login();
  // Wait until the CLI has started (a fixed delay is flaky when the whole suite runs in parallel)
  while (!spawn.runs.length) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(login.cancel(), { ok: true });
  assert.deepEqual(await pending, { ok: false, reason: 'cancelled' });
  assert.deepEqual(spawn.runs[0].child.killed, ['SIGTERM']);
  assert.deepEqual(saveKey.saved, [], 'a cancelled login saves nothing');
  assert.deepEqual(loginFolders(dir), []);
  assert.deepEqual(login.cancel(), { ok: true }, 'nothing to cancel is fine');
});

test('cancel right away (before the CLI starts) also answers cancelled', async () => {
  const dir = tmpDir();
  const spawn = fakeSpawn(() => {});
  const login = createElevenLabsLogin({ dir, spawn, saveKey: saver() });
  const pending = login.login();
  login.cancel();
  assert.deepEqual(await pending, { ok: false, reason: 'cancelled' });
  assert.deepEqual(loginFolders(dir), []);
});

test('timeout: the CLI is killed, even one that ignores the signal, and the folder is deleted', async () => {
  const dir = tmpDir();
  const spawn = fakeSpawn((child) => { child.ignoreKill = true; });
  const login = createElevenLabsLogin({ dir, spawn, saveKey: saver(), timeoutMs: 30, killGraceMs: 30 });
  assert.deepEqual(await login.login(), { ok: false, reason: 'timeout' });
  // SIGTERM first; after the grace period a CLI that ignored it is killed for real, before the cleanup
  assert.deepEqual(spawn.runs[0].child.killed, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(loginFolders(dir), []);
});

test('with a pid (POSIX), the signals go to the CLI\'s whole process group', { skip: process.platform === 'win32' }, async () => {
  const dir = tmpDir();
  const spawn = fakeSpawn((child) => { child.ignoreKill = true; });
  const real = spawn;
  const withPid = (...args) => Object.assign(real(...args), { pid: 4321 });
  const group = [];
  const killGroup = (pid, signal) => { group.push([pid, signal]); };
  const login = createElevenLabsLogin({ dir, spawn: withPid, saveKey: saver(), timeoutMs: 20, killGraceMs: 20, killGroup });
  assert.deepEqual(await login.login(), { ok: false, reason: 'timeout' });
  assert.deepEqual(group, [[4321, 'SIGTERM'], [4321, 'SIGKILL']]);
  assert.deepEqual(spawn.runs[0].child.killed, [], 'the group kill worked: no need for the child alone');
  // a group that is already gone falls back to the child
  const spawn2 = fakeSpawn((child) => { child.ignoreKill = true; });
  const gone = () => { throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); };
  const login2 = createElevenLabsLogin({ dir, spawn: (...a) => Object.assign(spawn2(...a), { pid: 4321 }), saveKey: saver(), timeoutMs: 20, killGraceMs: 20, killGroup: gone });
  assert.deepEqual(await login2.login(), { ok: false, reason: 'timeout' });
  assert.deepEqual(spawn2.runs[0].child.killed, ['SIGTERM', 'SIGKILL']);
});

test('quitting Qubbot during a login kills the CLI at once and removes its folder', async () => {
  const dir = tmpDir();
  const spawn = fakeSpawn(() => {}); // waits for the browser
  const saveKey = saver();
  const login = createElevenLabsLogin({ dir, spawn, saveKey });
  const pending = login.login();
  await new Promise((resolve) => setTimeout(resolve, 20));
  login.quit();
  assert.deepEqual(spawn.runs[0].child.killed, ['SIGKILL']);
  assert.deepEqual(loginFolders(dir), [], 'removed synchronously, before the app exits');
  assert.deepEqual(await pending, { ok: false, reason: 'cancelled' });
  assert.deepEqual(saveKey.saved, []);
  login.quit(); // nothing running: fine
});

test('sweepLogins (at startup) removes login folders a crash left, and nothing else', async () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'elevenlabs-login-old'));
  fs.writeFileSync(path.join(dir, 'elevenlabs-login-old', 'elevenlabs-login.env'), 'ELEVENLABS_API_KEY=x\n');
  fs.writeFileSync(path.join(dir, 'other.json'), '{}');
  await sweepLogins(dir);
  assert.deepEqual(loginFolders(dir), []);
  assert.ok(fs.existsSync(path.join(dir, 'other.json')));
  await sweepLogins(path.join(dir, 'missing')); // no folder: nothing to do
});

test('one login at a time: a second call gets the same answer; folders a crash left are swept', async () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'elevenlabs-login-crashed'));
  fs.writeFileSync(path.join(dir, 'elevenlabs-login-crashed', 'elevenlabs-login.env'), 'ELEVENLABS_API_KEY=x\n');
  fs.writeFileSync(path.join(dir, 'other.json'), '{}');
  const spawn = fakeSpawn(signsIn);
  const login = createElevenLabsLogin({ dir, spawn, saveKey: saver() });
  const [a, b] = await Promise.all([login.login(), login.login()]);
  assert.deepEqual(a, b);
  assert.equal(spawn.runs.length, 1);
  assert.deepEqual(loginFolders(dir), []);
  assert.ok(fs.existsSync(path.join(dir, 'other.json')), 'other files are left alone');
  // after it ends, a new login runs again
  await login.login();
  assert.equal(spawn.runs.length, 2);
});

test('a keychain that keeps the key only in memory is reported', async () => {
  const dir = tmpDir();
  const saveKey = async (key) => ({ ok: true, last4: key.slice(-4), reason: 'weak-keychain' });
  assert.deepEqual(await createElevenLabsLogin({ dir, spawn: fakeSpawn(signsIn), saveKey }).login(), { ok: true, last4: '171e', reason: 'weak-keychain' });
});

test('statusOf keeps only key_status and next from the CLI output', () => {
  assert.deepEqual(statusOf(`noise\n{"key_status":"existing","next":"run","api_key":"${KEY}"}\n`), { key_status: 'existing', next: 'run' });
  assert.deepEqual(statusOf('{"a":1}\nnot json'), {});
  assert.deepEqual(statusOf(''), {});
  assert.deepEqual(statusOf('{\n  "key_status": "created"\n}'), { key_status: 'created', next: undefined });
});
