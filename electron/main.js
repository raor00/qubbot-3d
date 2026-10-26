// Electron main process: creates the window and is the only part that touches the disk.
// The window (renderer) asks for things over IPC and they are validated here before running.

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage, systemPreferences, session: electronSession } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const { existsSync, readFileSync } = require('node:fs');
const { Workspace } = require('./workspace');
const { readGitHistory, planCommit, gitCommit, gitRevert, gitReset, gitCreateBranch, gitCheckout, gitShowShort, gitInit } = require('./git');
const t = require('./strings');
const agents = require('./agents');
const { loadVoice, composePrompt, composeRefinePrompt, composeTourPrompt } = require('./agentVoice');
const { approvalMode, needsApproval } = require('./approval');
const { createTrustStore } = require('./trust');
const { createSecretStore } = require('./secretStore');
const { createSupabaseConnector } = require('./supabaseConnect');
const { mergeEnv, protectEnv, projectNameFor, isReady, isProjectRef, refFromEnv, planLimitBytes, ENV_URL, ENV_KEY } = require('./supabaseLink');
const { canOpen } = require('./fileOpen');
const { lineDiff } = require('./lineDiff');
const { createKeyStore } = require('./keyStore');
const { createVoiceCall, LIMITS: VOICE_LIMITS, LEVELS: VOICE_LEVELS, STYLES: VOICE_STYLES, VOICES, PROVIDERS: VOICE_PROVIDERS } = require('./voiceCall');
const { createProjectMemory } = require('./projectMemory');
const { createSecurityStore, createSecurityService } = require('./securityStore');
const { parseCommand, classify, commandNeedsApproval, createCommandRunner } = require('./commandRun');
const { createProjectRun } = require('./projectRun');
const { LINKS, publicCatalog } = require('./serviceCatalog');
const { createServiceStatus } = require('./serviceStatus');

const AGENT_DIR = path.join(__dirname, '..', 'agent'); // voice.json + skills (packaged with the app)
// Agent conversations: the chat, Qubi's repairs, "Mejorar mi mensaje" (never continued), the tour, and
// Qubi's team in a call: up to three workers at once plus a read-only review (docs/features/llamada/FASE2.md)
const SESSIONS = ['chat', 'repair', 'refine', 'tour', 'review', 'worker-1', 'worker-2', 'worker-3'];
const WORKER_SESSION = /^worker-([1-3])$/;
const WORKER_ID = /^w([1-3])-[a-z0-9]{4,12}$/;
const MAX_SCOPE_FOLDERS = 2;
const MAX_SCOPE_CHARS = 200;
const { startMcpServer, MAX_READ_BYTES, isBlockedPath, isBlockedRealPath } = require('./mcpServer');
const servers = require('./servers');
const lab = require('./lab');

const workspace = new Workspace();
const audit = []; // log of everything done on disk
let win = null;
let mcp = { url: null, running: false }; // local MCP server for the user's agent

// Qubi's glass tile (build/icon.*, made from the brand image): the installers use build/icon.icns / .ico;
// while developing, the Dock and the window take the PNG so the app never shows Electron's atom
const APP_ICON = path.join(__dirname, '..', 'build', 'icon.png');

function createWindow() {
  if (process.platform === 'darwin' && !app.isPackaged && existsSync(APP_ICON)) app.dock?.setIcon(APP_ICON);
  win = new BrowserWindow({
    ...(process.platform !== 'darwin' && existsSync(APP_ICON) ? { icon: APP_ICON } : {}),
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: t.windowTitle,
    backgroundColor: '#0a0b0f',
    // macOS: integrated title bar; the window buttons sit inside the app's 44px title bar
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 } } : {}),
    // Windows/Linux: the app draws its own menus in the title bar; the native bar stays hidden
    // (its shortcuts keep working)
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // the page sees neither Node nor Electron, only what preload exposes
      nodeIntegration: false,
      sandbox: true,
      // npm run dev: the window shows dev-only readouts (the hand tracker's frame rate)
      additionalArguments: process.argv.includes('--dev') ? ['--platanus-dev'] : [],
    },
  });

  // PLATANUS_DEMO=1 (development only): recording mode for the product video (scripts/demo/)
  const demo = process.env.PLATANUS_DEMO === '1' && !app.isPackaged;
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), demo ? { query: { demo: '1' } } : {});
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });

  // External links never open new windows inside the app
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler(allowPermission);
}

// The page only gets, and only for the app's own page: the copy button's clipboard, the camera for the hand
// gestures, and the microphone for a call with Qubi (only right after main handed out a call's signed URL).
// Everything else is denied. macOS asks the person first, for the camera and the microphone separately.
const RENDERER_URL = `${pathToFileURL(path.join(__dirname, '..', 'renderer')).href}/`;
const MIC_AFTER_CALL_MS = 60_000; // the window opens the microphone right after voice:start answers
let callStartedAt = 0;
async function allowPermission(contents, permission, callback, details) {
  const own = contents === win?.webContents && (details.requestingUrl ?? '').startsWith(RENDERER_URL);
  if (own && permission === 'clipboard-sanitized-write') return callback(true);
  const types = permission === 'media' ? details.mediaTypes ?? [] : [];
  const known = types.length && types.every((type) => type === 'video' || type === 'audio');
  if (!own || !known) return callback(false);
  if (types.includes('audio') && Date.now() - callStartedAt > MIC_AFTER_CALL_MS) return callback(false);
  for (const media of new Set(types.map((type) => (type === 'audio' ? 'microphone' : 'camera')))) {
    if (!(await systemAccess(media))) return callback(false);
  }
  callback(true);
}

// macOS keeps its own switch per app for the camera and the microphone
async function systemAccess(media) {
  if (process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus(media) === 'granted') return true;
  return systemPreferences.askForMediaAccess(media).catch(() => false);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function log(action, target, ok, detail) {
  const entry = { at: new Date().toISOString(), action, path: target, ok, detail };
  audit.push(entry);
  send('audit', entry);
  return entry;
}

// Wraps each operation: logs it and returns { ok, data } or { ok: false, error }
function handle(channel, action, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      const data = await fn(...args);
      log(action, args[0], true);
      return { ok: true, data };
    } catch (err) {
      log(action, args[0], false, err.message);
      return { ok: false, error: err.message };
    }
  });
}

// --- Workspace ---
ipcMain.handle('workspace:choose', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: t.chooseFolder,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false, error: t.cancelled };
  return openWorkspace(res.filePaths[0]);
});

// New project: the person picks a name and a place, Qubbot creates the empty folder and opens it.
// An existing folder is only reused when it is empty, so nothing of the person's is touched.
ipcMain.handle('workspace:create', async () => {
  const res = await dialog.showSaveDialog(win, {
    title: t.newProject,
    message: t.newProjectMessage,
    buttonLabel: t.create,
    defaultPath: path.join(app.getPath('documents'), t.defaultProjectName),
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (res.canceled || !res.filePath) return { ok: false, cancelled: true, error: t.cancelled };
  const dir = res.filePath;
  try {
    const entries = await fs.readdir(dir);
    if (entries.some((name) => name !== '.DS_Store')) return { ok: false, error: t.folderNotEmpty };
  } catch (err) {
    if (err.code !== 'ENOENT') return { ok: false, error: err.message };
    await fs.mkdir(dir, { recursive: true });
  }
  log('workspace:create', dir, true);
  // Its own git repository from the start (no git installed: the project still opens, just without history)
  const init = await gitInit(dir);
  log('git:init', dir, init.ok);
  return openWorkspace(dir);
});

// Trusted folders: in the open folder, if the person trusts it, the agent's changes are saved without asking
// (secrets are still refused and every change is backed up). Read again each time a folder opens.
const trustStore = createTrustStore(path.join(app.getPath('userData'), 'trusted-folders.json'));
let trustedNow = false;

async function openWorkspace(dir) {
  const root = await workspace.open(dir);
  trustedNow = await trustStore.has(root);
  workspace.watch((paths) => send('fs:changed', paths));
  log('workspace:open', root, true);
  await rememberRecent(root);
  refreshMenu();
  return { ok: true, data: { root, name: path.basename(root) } };
}

// --- Recent projects (only folders the user already chose can be reopened from the window) ---
const MAX_RECENT = 8;
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');

async function readRecent() {
  try {
    const list = JSON.parse(await fs.readFile(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((r) => typeof r?.root === 'string') : [];
  } catch {
    return [];
  }
}

async function rememberRecent(root) {
  const list = (await readRecent()).filter((r) => r.root !== root);
  list.unshift({ root, name: path.basename(root), at: new Date().toISOString() });
  await fs.writeFile(recentFile(), JSON.stringify(list.slice(0, MAX_RECENT), null, 2)).catch(() => {});
}

// Recent folders that still exist
async function aliveRecent() {
  const list = await readRecent();
  const alive = await Promise.all(list.map((r) => fs.stat(r.root).then((s) => s.isDirectory(), () => false)));
  return list.filter((_r, i) => alive[i]);
}

ipcMain.handle('workspace:recent', async () => ({ ok: true, data: await aliveRecent() }));

ipcMain.handle('workspace:openRecent', async (_e, root) => {
  if (!(await readRecent()).some((r) => r.root === root)) return { ok: false, error: t.notRecent };
  try {
    return await openWorkspace(root);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// The window asks right after a project opens; the answer comes from a native dialog, never from the page.
// "Sí" is remembered for that folder; "No" asks again next time.
ipcMain.handle('workspace:trust', async (_e, ask = false) => {
  if (!workspace.root) return { ok: false, error: t.mcp.noProject };
  if (trustedNow || !ask) return { ok: true, data: trustedNow };
  const root = workspace.root;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: [t.trust.no, t.trust.yes],
    defaultId: 1,
    cancelId: 0,
    message: t.trust.question(path.basename(root)),
    detail: t.trust.detail,
  });
  if (response !== 1 || workspace.root !== root) return { ok: true, data: trustedNow };
  await trustStore.set(root, true);
  trustedNow = true;
  log('workspace:trust', root, true);
  return { ok: true, data: true };
});

// Stop trusting the open folder: every change asks again (per the permission mode)
ipcMain.handle('workspace:untrust', async () => {
  if (!workspace.root) return { ok: false, error: t.mcp.noProject };
  await trustStore.set(workspace.root, false);
  trustedNow = false;
  log('workspace:untrust', workspace.root, true);
  return { ok: true, data: false };
});

ipcMain.handle('workspace:close', () => {
  trustedNow = false;
  if (workspace.root) log('workspace:close', workspace.root, true);
  workspace.close();
  refreshMenu();
  return { ok: true };
});

ipcMain.handle('workspace:current', () => ({
  ok: true,
  data: workspace.root ? { root: workspace.root, name: path.basename(workspace.root) } : null,
}));

ipcMain.handle('audit:list', () => ({ ok: true, data: audit }));

// --- Servers listening on this computer (the window polls the list, so listing is not audited) ---
const serverError = (err) => t.servers[err?.code] ?? t.servers.failed;
const pausedPids = new Map(); // pid -> { port }: processes Qubbot paused (resumed on quit)
const stoppedServers = servers.createStoppedRegistry(); // stopped from Qubbot, with how to reactivate them

// Servers Qubbot started (reactivated). One that closes on its own goes to "Detenidos" with its exit code
// and output; one that was still starting turns "exited" there. Stops made by the person are not crashes.
const managedServers = servers.createManagedServers({
  onExit(entry, { code, signal, expected, output }) {
    const row = stoppedServers.findByPid(entry.pid);
    // A project Qubi started (projectRun.js) is launched before its port is known: it is found afterwards
    const port = entry.port ?? projectRun.portOf(entry.pid);
    if (row) {
      stoppedServers.update(row.id, { state: expected ? 'stopped' : 'exited', exitCode: code, pid: null, output });
    } else if (!expected && port) {
      stoppedServers.add({ port, process: entry.process, restart: entry.restart, state: 'exited', exitCode: code, output });
    }
    if (!expected) log('servers:exited', `${entry.process ?? '?'} :${port ?? '?'}`, false, String(code ?? signal));
  },
});

ipcMain.handle('servers:list', async () => {
  try {
    const data = await servers.listServers({
      paused: pausedPids,
      managed: managedServers.pids(),
      onEntries: (entries) => servers.reconcileStarting(stoppedServers, entries),
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, code: err?.code ?? 'failed', error: serverError(err) };
  }
});

// Runs a server action, audits it and answers { ok, data } or { ok: false, code, error } (Spanish text)
function serverAction(channel, fn) {
  ipcMain.handle(channel, async (_e, arg, ...rest) => {
    try {
      const { data, audit: target } = await fn(arg, ...rest);
      log(channel, target, true);
      return { ok: true, data };
    } catch (err) {
      log(channel, String(arg).slice(0, 40), false, err?.code);
      return { ok: false, code: err?.code ?? 'failed', error: serverError(err) };
    }
  });
}

const doneWith = ({ port, processes }) => ({ data: { port, processes }, audit: `${processes.join(', ')} :${port}` });

// Pause / resume need no dialog: both are undone with one click, and everything paused is resumed on quit
serverAction('servers:pause', async (port) => doneWith(await servers.pauseServer(port, { paused: pausedPids })));
serverAction('servers:resume', async (port) => doneWith(await servers.resumeServer(port, { paused: pausedPids })));

// Servers stopped from Qubbot: { id, port, process, canRestart, state, exitCode, hasOutput, at }
// (the command, folder and output stay here)
ipcMain.handle('servers:stopped', () => ({ ok: true, data: stoppedServers.list() }));
serverAction('servers:forget', async (id) => {
  if (stoppedServers.get(id)?.state === 'starting') throw Object.assign(new Error('starting'), { code: 'alreadyStarting' });
  return { data: stoppedServers.forget(id), audit: String(id) };
});

const isPortBusy = async (port) => (await servers.readEntries()).some((e) => e.port === port);

// Reactivate inside Qubbot: asks first, then the server runs as a child of the app (no Terminal window)
serverAction('servers:restart', async (id) => {
  const result = await servers.restartServer(id, {
    registry: stoppedServers,
    isPortBusy,
    start: (row) => managedServers.start({ port: row.port, process: row.process, restart: row.restart }),
    confirm: (row) => confirm(
      t.servers.confirmRestart(row.process ?? t.servers.unknownProcess, row.port),
      t.servers.confirmRestartDetail(servers.maskSecrets(row.command), row.cwd),
      t.servers.restartButton,
    ),
  });
  return { data: result, audit: `${result.process ?? '?'} :${result.port}` };
});

// Cancel a reactivation that has not started listening yet (no dialog: Qubbot started it a moment ago)
serverAction('servers:cancelStart', async (id) => {
  const row = stoppedServers.get(id);
  if (!row || row.state !== 'starting' || !row.pid) throw Object.assign(new Error('notStarting'), { code: 'notStarting' });
  const output = managedServers.output(row.pid);
  managedServers.markExpected(row.pid);
  try { servers.terminate(row.pid, { paused: pausedPids }); } catch { /* it already closed */ }
  stoppedServers.update(id, { state: 'stopped', pid: null, output });
  return { data: null, audit: `${row.process ?? '?'} :${row.port}` };
});

// Output of a server Qubbot started: by port (running) or by the id of its row in "Detenidos"
ipcMain.handle('servers:output', (_e, key) => {
  if (Number.isInteger(key) && key >= 1 && key <= 65535) {
    const pid = managedServers.pidOnPort(key);
    return { ok: true, data: pid ? managedServers.output(pid) ?? '' : '' };
  }
  const row = stoppedServers.get(key);
  if (!row) return { ok: false, code: 'unknownStopped', error: t.servers.unknownStopped };
  return { ok: true, data: (row.state === 'starting' && row.pid ? managedServers.output(row.pid) : row.output) ?? '' };
});

const findBrowsers = () => servers.detectBrowsers({ exists: existsSync });

// Installed browsers, without their paths: the page only chooses one by id
ipcMain.handle('servers:browsers', () => ({ ok: true, data: findBrowsers().map(({ id, name }) => ({ id, name })) }));

// "Elegir otra app…": the person picks the browser in the system dialog (the page never sends a path)
async function pickBrowserApp() {
  const mac = process.platform === 'darwin';
  const res = await dialog.showOpenDialog(win, {
    title: t.servers.chooseApp,
    defaultPath: mac ? '/Applications' : process.env.ProgramFiles,
    properties: ['openFile'],
    filters: [{ name: t.servers.apps, extensions: [mac ? 'app' : 'exe'] }],
  });
  const file = res.canceled ? null : res.filePaths[0];
  if (file && !servers.isAppPath(process.platform, file)) throw Object.assign(new Error('notAnApp'), { code: 'notAnApp' });
  return file;
}

ipcMain.handle('servers:open', async (_e, port, browser) => {
  try {
    const url = await servers.openServer(port, {
      browser: browser ?? 'default',
      openExternal: (u) => shell.openExternal(u),
      launch: (app, u) => servers.launchApp(app, u),
      pickApp: pickBrowserApp,
      findBrowsers,
    });
    log('servers:open', `${url} · ${String(browser ?? 'default').slice(0, 20)}`, true);
    return { ok: true, data: url };
  } catch (err) {
    log('servers:open', String(port).slice(0, 40), false, err?.code);
    return { ok: false, code: err?.code ?? 'failed', error: serverError(err) };
  }
});

// Stopping always asks; the pid is found here from the port and checked again after the dialog. Before it
// stops, the command and folder are kept here (never sent to the page) so it can be reactivated: for a
// server Qubbot started they are the ones it used, so it can always be reactivated again.
serverAction('servers:stop', async (port) => {
  const result = await servers.stopServer(port, {
    kill: (pid) => {
      managedServers.markExpected(pid);
      servers.terminate(pid, { paused: pausedPids });
    },
    capture: async (pid) => managedServers.restartInfo(pid) ?? servers.captureRestart(pid),
    confirm: (targets, p) => confirm(
      t.servers.confirmStop(targets.map((x) => x.process ?? t.servers.unknownProcess).join(', '), p),
      t.servers.confirmStopDetail,
      t.servers.stopButton,
    ),
  });
  for (const row of result.stopped) stoppedServers.add({ ...row, output: managedServers.output(row.pid) });
  return doneWith(result);
});

// --- Starting the open project (Qubi's ejecutar_app, projectRun.js): only its own dev/start scripts,
// chosen by the id of this list, and always after this native dialog (the window asked the person too) ---
const projectRun = createProjectRun({
  managed: managedServers,
  readEntries: () => servers.readEntries(),
  // the detail shows what the script really runs, masked like servers:restart: an agent may have rewritten it
  confirm: ({ command, cwd, body }) => confirm(
    t.run.confirm(command, cwd === '.' ? t.run.rootFolder : cwd),
    `${t.run.confirmDetail}\n\n${t.run.runs(servers.maskSecrets(body ?? ''))}`,
    t.run.allowButton,
  ),
});

ipcMain.handle('run:scripts', async () => {
  try {
    return { ok: true, data: await projectRun.scripts(workspace.root) };
  } catch {
    return { ok: false, reason: 'failed', error: t.run.failed };
  }
});

// -> { ok: true, port: number | null } | { ok: false, reason, error } (error: Spanish text of main)
ipcMain.handle('run:start', async (_e, id) => {
  const result = await projectRun.start(workspace.root, id).catch(() => ({ ok: false, reason: 'failed' }));
  log('run:start', String(id ?? '').slice(0, 80), result.ok, result.ok ? `:${result.port ?? '?'}` : result.reason);
  return result.ok ? result : { ...result, error: t.run[result.reason] ?? t.run.failed };
});

// --- Git: read ---
ipcMain.handle('git:history', async () => ({ ok: true, data: await readGitHistory(workspace.root) }));

// --- Git: write (asked for from the chat). git.js validates every value; here each operation is
// logged, anything that changes files or history asks first, and errors come back in Spanish. ---
const MAX_LISTED_COMMIT_FILES = 12;
const CANCELLED = { ok: false, error: 'cancelled' }; // the chat answers "cancelado" for this one

function gitAnswer(op, target, result, extra = {}) {
  log(`git:${op}`, String(target ?? '').slice(0, 60), result.ok, result.detail ?? result.code);
  if (!result.ok) {
    const text = t.git.errors[result.code] ?? t.git.errors.failed;
    return { ok: false, code: result.code, error: typeof text === 'function' ? text(result.detail) : text };
  }
  send('git:changed', { op, ...extra, data: result.data });
  return result;
}

// Commit: shows the files that go in and refuses if one is a secret (.env, keys…) that .gitignore lets through
ipcMain.handle('git:commit', async (_e, message) => {
  const plan = await planCommit(workspace.root, isBlockedPath);
  if (!plan.ok) return gitAnswer('commit', message, plan);
  const { files, secrets } = plan.data;
  if (secrets.length) return gitAnswer('commit', message, { ok: false, code: 'secretFiles', detail: secrets.join(', ') });
  if (!files.length) return gitAnswer('commit', message, { ok: false, code: 'nothingToCommit' });
  const listed = files.slice(0, MAX_LISTED_COMMIT_FILES).join('\n') + (files.length > MAX_LISTED_COMMIT_FILES ? `\n${t.git.andMore(files.length - MAX_LISTED_COMMIT_FILES)}` : '');
  if (!(await confirm(t.git.confirmCommit(String(message ?? '').trim(), files.length), listed, t.git.commitButton))) return CANCELLED;
  return gitAnswer('commit', message, await gitCommit(workspace.root, message, files));
});

ipcMain.handle('git:revert', async (_e, rev) => {
  const preview = await gitShowShort(workspace.root, rev);
  if (!preview.ok) return gitAnswer('revert', rev, preview);
  if (!(await confirm(t.gitConfirmRevert(preview.data), t.gitConfirmRevertDetail))) return CANCELLED;
  return gitAnswer('revert', rev, await gitRevert(workspace.root, rev), { sha: rev });
});

ipcMain.handle('git:reset', async (_e, rev) => {
  const preview = await gitShowShort(workspace.root, rev);
  if (!preview.ok) return gitAnswer('reset', rev, preview);
  if (!(await confirm(t.gitConfirmReset(preview.data), t.gitConfirmResetDetail))) return CANCELLED;
  return gitAnswer('reset', rev, await gitReset(workspace.root, rev), { sha: rev });
});

// A new branch keeps the files as they are: no dialog, only logged
ipcMain.handle('git:createBranch', async (_e, name) =>
  gitAnswer('createBranch', name, await gitCreateBranch(workspace.root, name), { name }));

// Switching changes the files on disk: ask first
ipcMain.handle('git:checkout', async (_e, target) => {
  if (!(await confirm(t.git.confirmCheckout(String(target ?? '').trim()), t.git.confirmCheckoutDetail, t.git.checkoutButton))) return CANCELLED;
  return gitAnswer('checkout', target, await gitCheckout(workspace.root, target), { target });
});

// --- Files (every path is relative to the workspace) ---
handle('fs:tree', 'tree', (rel) => workspace.tree(rel));
handle('fs:read', 'read', (rel) => workspace.readFile(rel));
handle('fs:mkdir', 'mkdir', (rel) => workspace.mkdir(rel));
// From the chat: "Abrir en el navegador" (pages, images, PDFs only: never a script or a program) and
// "Mostrar en la carpeta". Files with secrets are never opened or revealed.
// Whether a path of the project is a file or a folder (the window loads the tree level by level)
ipcMain.handle('fs:kind', async (_e, rel) => {
  try {
    const stat = await fs.stat(await workspace.resolve(rel));
    return { ok: true, data: stat.isDirectory() ? 'dir' : 'file' };
  } catch {
    return { ok: true, data: null };
  }
});
handle('fs:open', 'open', async (rel, how) => {
  if (!workspace.root) throw new Error(t.mcp.noProject);
  const abs = await workspace.resolve(rel);
  if (await isBlockedRealPath(workspace.root, abs)) throw new Error(t.cannotOpenSecret);
  // The real file (a link named page.html could point to a script): it must be a file of a kind that opens
  const real = await fs.realpath(abs).catch(() => null);
  const fromRoot = real && path.relative(await fs.realpath(workspace.root), real);
  const inside = real && !fromRoot.startsWith('..') && !path.isAbsolute(fromRoot);
  if (!inside) throw new Error(t.cannotOpen);
  if (how === 'reveal') { shell.showItemInFolder(real); return true; }
  if (!(await fs.stat(real)).isFile() || !canOpen(real)) throw new Error(t.cannotOpen);
  const problem = await shell.openPath(real);
  if (problem) throw new Error(t.cannotOpen);
  return true;
});

// Creating a new file is free; overwriting an existing one asks for confirmation
handle('fs:write', 'write', async (rel, content) => {
  if (await workspace.exists(rel)) {
    const ok = await confirm(t.confirmOverwrite(rel), t.confirmOverwriteDetail);
    if (!ok) throw new Error(t.overwriteRejected);
  }
  await workspace.writeFile(rel, content);
});

// --- Editor: files the person opens and saves by hand (the agent never comes through here, it only has
// the MCP tools, which still refuse secrets). Secrets open too, flagged; saving one asks first. A save
// carries the mtime the file was read with and is refused if the file changed on disk meanwhile; the
// previous version is backed up like an agent's change. ---
const EDITOR_MAX_BYTES = 2 * 1024 * 1024;
const BINARY_PROBE_BYTES = 8000;
const editorError = (code, message = t.editor.errors[code]) => Object.assign(new Error(message), { code });

async function editorAnswer(action, rel, fn) {
  try {
    const data = await fn();
    log(action, rel, true);
    return { ok: true, data };
  } catch (err) {
    log(action, rel, false, err.message);
    return { ok: false, code: err.code ?? 'failed', error: err.message };
  }
}

ipcMain.handle('editor:open', (_e, rel) => editorAnswer('editor:open', rel, async () => {
  const abs = await workspace.resolve(rel);
  const stat = await fs.stat(abs).catch(() => { throw editorError('notFound'); });
  if (!stat.isFile()) throw editorError('notFile');
  if (stat.size > EDITOR_MAX_BYTES) throw editorError('tooLarge');
  const bytes = await fs.readFile(abs);
  if (bytes.subarray(0, BINARY_PROBE_BYTES).includes(0)) throw editorError('binary');
  const secret = isBlockedPath(rel) || (await isBlockedRealPath(workspace.root, abs));
  return { content: bytes.toString('utf8'), mtime: stat.mtimeMs, secret };
}));

ipcMain.handle('editor:save', (_e, rel, content, mtime) => editorAnswer('editor:save', rel, async () => {
  if (typeof content !== 'string') throw editorError('failed');
  if (Buffer.byteLength(content) > EDITOR_MAX_BYTES) throw editorError('tooLarge');
  const abs = await workspace.resolve(rel);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat?.isFile()) throw editorError('notFound');
  if (stat.mtimeMs !== mtime) throw editorError('changedOnDisk');
  if (isBlockedPath(rel) || (await isBlockedRealPath(workspace.root, abs))) {
    if (!(await confirm(t.editor.confirmSecret(rel), t.editor.confirmSecretDetail, t.editor.saveButton))) throw editorError('cancelled');
  }
  await backupFile(rel, abs, true);
  await workspace.writeFile(rel, content);
  return { mtime: (await fs.stat(abs)).mtimeMs };
}));

// Deleting always asks for confirmation
handle('fs:delete', 'delete', async (rel) => {
  const ok = await confirm(t.confirmDelete(rel), t.confirmDeleteDetail);
  if (!ok) throw new Error(t.deleteRejected);
  await workspace.remove(rel);
});


// --- Arduino lab (electron/lab.js): the person's own bench, no dialogs; only fixed files ---
function labAnswer(action, target, fn) {
  return async (_e, ...args) => {
    try {
      const data = await fn(...args);
      log(action, target, true);
      return { ok: true, data };
    } catch (err) {
      log(action, target, false, err.message);
      return { ok: false, error: err.message };
    }
  };
}
ipcMain.handle('lab:load', labAnswer('lab:load', lab.DESIGN_FILE, () => lab.loadDesignText(workspace, { guard: refuseSecretTarget })));
ipcMain.handle('lab:save', labAnswer('lab:save', lab.DESIGN_FILE, (text) => lab.saveDesign(workspace, text, { guard: refuseSecretTarget })));
ipcMain.handle('lab:export', (e, kind, content) => labAnswer('lab:export', Object.hasOwn(lab.EXPORT_FILES, kind) ? lab.EXPORT_FILES[kind] : '', () => lab.exportFile(workspace, kind, content, { guard: refuseSecretTarget }))(e));

// --- Local MCP server: the user's agent (Claude Code, Cursor, Codex, Gemini or the chat CLIs) ---
// Tools that need what the window knows (traffic lights, the map) are answered by the renderer.
const pending = new Map();
let requestSeq = 0;

function askRenderer(tool, args) {
  if (!win || win.isDestroyed()) return Promise.reject(new Error(t.mcp.windowClosed));
  const id = ++requestSeq;
  send('mcp:request', { id, tool, args });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(t.mcp.timeout)); }, 5000);
    pending.set(id, { resolve, reject, timer });
  });
}

ipcMain.handle('mcp:reply', (_e, { id, ok, data, error }) => {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  if (ok) entry.resolve(data);
  else entry.reject(new Error(error));
});

// Paths only, up to 4 levels: enough for the agent to orient itself without dumping the whole disk
function flatten(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push(n.type === 'dir' ? `${n.path}/` : n.path);
    if (n.children && depth < 3) flatten(n.children, depth + 1, out);
  }
  return out;
}

const mcpHandlers = {
  platanus_get_project: async () => {
    if (!workspace.root) throw new Error(t.mcp.noProject);
    return { name: path.basename(workspace.root), paths: flatten(await workspace.tree('.', 4)).slice(0, 400) };
  },
  platanus_list_risks: () => askRenderer('list_risks', {}),
  platanus_read_file: async ({ path: rel }) => {
    if (!workspace.root) throw new Error(t.mcp.noProject);
    const abs = await workspace.resolve(rel);
    await refuseSecretTarget(abs);
    const { size } = await fs.stat(abs);
    if (size > MAX_READ_BYTES) throw new Error(t.mcp.tooLarge(Math.round(MAX_READ_BYTES / 1024)));
    return workspace.readFile(rel);
  },
  // Writes are approved per the agent permission mode (approval.js), or saved on their own in a folder
  // the person trusts (trust.js); the previous version is always backed up and can be undone
  // context.worker: the call came through a worker's address (/mcp/<token>/w/<id>), so the change belongs
  // to that worker of Qubi's team and must stay inside its folders (mcpServer.js checks the path; here the
  // real path is checked too, since a link inside the folder could lead out of it)
  platanus_write_file: async ({ path: rel, content, reason }, { worker } = {}) => {
    const requestedAt = new Date().toISOString(); // before the dialog: tells which agent run asked
    if (!workspace.root) throw new Error(t.mcp.noProject);
    if (Buffer.byteLength(content) > MAX_READ_BYTES) throw new Error(t.mcp.tooLarge(Math.round(MAX_READ_BYTES / 1024)));
    const abs = await workspace.resolve(rel);
    const exists = await workspace.exists(rel);
    await refuseSecretTarget(abs); // new files too: a symlinked parent may lead into .git/ or a secret
    if (worker) await refuseOutsideScope(abs, worker);
    const by = worker ? { worker } : {}; // the window tells the chat's changes from the team's
    const why = String(reason).slice(0, 300);
    const oldBytes = exists ? (await fs.stat(abs)).size : 0;
    // What changes, line by line (lineDiff.js): the chat shows it while asking and once saved
    const before = exists && oldBytes <= MAX_READ_BYTES ? await fs.readFile(abs, 'utf8').catch(() => null) : null;
    const diff = exists && before == null ? null : lineDiff(exists ? before : null, content);
    const ask = !trustedNow && needsApproval(approvalModeNow, { path: rel, exists, oldBytes, newBytes: Buffer.byteLength(content) });
    if (ask) {
      // Dialogs wait in line: by the time this one's turn comes the worker may be cancelled or ended, or
      // another project open. Then no dialog opens, and after an approval both are checked again.
      const rootAtCheck = workspace.root;
      const stillValid = () => workspace.root === rootAtCheck && (!worker || workerScopes.has(worker));
      send('agent:awaiting', { path: rel, waiting: true, diff, reason: why, ...by }); // "Esperando tu aprobación…" + the proposed change
      const title = worker ? t.mcp.confirmWorkerWrite(WORKER_ID.exec(worker)?.[1] ?? '', rel) : t.mcp.confirmWrite(rel);
      const ok = await confirm(title, t.mcp.confirmWriteDetail(why, exists), t.allow, stillValid).finally(() => send('agent:awaiting', { path: rel, waiting: false, ...by }));
      if (!ok || !stillValid()) throw new Error(t.mcp.writeRejected);
      if (worker) await refuseOutsideScope(abs, worker);
    }
    const backup = await backupFile(rel, abs, exists);
    await workspace.writeFile(rel, content);
    // approvedBy: 'you' (the dialog), 'trusted' (a trusted folder) or the mode that saved it on its own
    const change = { path: rel, reason: why, created: !exists, backup, requestedAt, at: new Date().toISOString(), approvedBy: ask ? 'you' : trustedNow ? 'trusted' : approvalModeNow, diff, ...by };
    send('agent:changed', change);
    return t.mcp.written(rel);
  },
  // One command of a short list (commandRun.js), no shell, inside the project; it asks first when it can
  // change something (per the permission mode). The agent gets the exit code and the output, keys covered.
  platanus_run_command: async ({ command, folder = '.', reason }) => {
    if (!workspace.root) throw new Error(t.mcp.noProject);
    const parsed = parseCommand(command);
    if (!parsed.ok) throw new Error(t.mcp.commandRefused(parsed.reason));
    const kind = classify(parsed.argv);
    if (!kind.ok) throw new Error(t.mcp.commandRefused(kind.reason));
    const dir = typeof folder === 'string' && folder.trim() ? folder.trim() : '.';
    const cwdAbs = await workspace.resolve(dir); // inside the project, links resolved
    if (!(await fs.stat(cwdAbs).catch(() => null))?.isDirectory()) throw new Error(t.mcp.commandNoFolder(dir));
    await refuseSecretTarget(cwdAbs);
    if (kind.file) { // node/python <script>: a file of the project, never a secret
      const fileRel = path.relative(workspace.root, path.resolve(cwdAbs, kind.file));
      await refuseSecretTarget(await workspace.resolve(fileRel));
    }
    const why = String(reason).slice(0, 300);
    const relDir = path.relative(workspace.root, cwdAbs) || '.';
    if (commandNeedsApproval(approvalModeNow, kind.kind)) {
      const rootAtCheck = workspace.root;
      const ok = await confirm(t.mcp.confirmCommand(kind.label), t.mcp.confirmCommandDetail(why, relDir), t.mcp.runButton, () => workspace.root === rootAtCheck);
      if (!ok || workspace.root !== rootAtCheck) throw new Error(t.mcp.commandRejected);
    }
    // the chat shows it as a step of the agent's run (agentEvents: run_command with the command as target)
    const result = await commandRunner.run({ root: workspace.root, cwd: relDir, argv: parsed.argv });
    return t.mcp.commandResult(kind.label, result);
  },
  // Deletes one file of the project: backed up first (undo puts it back), asks unless "Sin preguntar"
  platanus_delete_file: async ({ path: rel, reason }, { worker } = {}) => {
    const requestedAt = new Date().toISOString();
    if (!workspace.root) throw new Error(t.mcp.noProject);
    const abs = await workspace.resolve(rel);
    await refuseSecretTarget(abs);
    if (worker) await refuseOutsideScope(abs, worker);
    const stat = await fs.lstat(abs).catch(() => null);
    if (!stat?.isFile()) throw new Error(t.mcp.deleteNotFile(rel));
    const why = String(reason).slice(0, 300);
    const ask = approvalModeNow !== 'bypass';
    if (ask) {
      const rootAtCheck = workspace.root;
      const ok = await confirm(t.mcp.confirmDelete(rel), t.mcp.confirmDeleteDetail(why), t.mcp.deleteButton, () => workspace.root === rootAtCheck);
      if (!ok || workspace.root !== rootAtCheck) throw new Error(t.mcp.writeRejected);
    }
    const before = stat.size <= MAX_READ_BYTES ? await fs.readFile(abs, 'utf8').catch(() => null) : null;
    const backup = await backupFile(rel, abs, true);
    await fs.rm(abs);
    const change = { path: rel, reason: why, created: false, deleted: true, backup, requestedAt, at: new Date().toISOString(), approvedBy: ask ? 'you' : approvalModeNow, diff: before == null ? null : lineDiff(before, ''), ...(worker ? { worker } : {}) };
    send('agent:changed', change);
    return t.mcp.deleted(rel);
  },
  platanus_set_file_score: ({ path: rel, level, reason }) => {
    send('agent:score', { path: rel, level, reason: String(reason).slice(0, 240) });
    return `${rel}: ${level}`;
  },
  platanus_show_folder: ({ path: rel }) => askRenderer('show_folder', { path: rel }),
};

// The lab's tools (electron/lab.js): read the bench, compute the change and save laboratorio/circuito.json through
// platanus_write_file above (approval per mode, backup, agent:changed). One at a time: each may wait for the person.
const labQueue = lab.createQueue();
for (const name of lab.LAB_TOOLS) {
  const writes = lab.LAB_WRITE_TOOLS.includes(name);
  mcpHandlers[`platanus_${name}`] = (args, context = {}) => labQueue(async () => {
    if (!workspace.root) throw new Error(t.mcp.noProject);
    if (writes && context.worker) throw new Error(t.mcp.lab.workerRefused);
    const result = await lab.applyLabTool(name, args, await lab.readDesign(workspace, { guard: refuseSecretTarget }));
    if (result.changed) await mcpHandlers.platanus_write_file({ path: lab.DESIGN_FILE, content: result.text, reason: result.reason }, context);
    return result.reply;
  });
}

// A symlink inside the project may point to a secret: check where the path really lands. For a file
// that does not exist yet, resolve its nearest existing parent folder and add the rest of the path.
async function refuseSecretTarget(abs) {
  if (await isBlockedRealPath(workspace.root, abs)) throw new Error(t.mcp.secret);
}

// A worker writes only inside its folders, judged by where the path really lands (links resolved, like
// isBlockedRealPath). A worker whose run already ended has no folders left, so it can write nothing.
async function refuseOutsideScope(abs, worker) {
  const folders = workerScopes.get(worker)?.folders ?? [];
  let probe = abs;
  const rest = [];
  while (!existsSync(probe) && path.dirname(probe) !== probe) {
    rest.unshift(path.basename(probe));
    probe = path.dirname(probe);
  }
  const real = path.join(await fs.realpath(probe).catch(() => probe), ...rest);
  const rel = path.relative(workspace.root, real).split(path.sep).join('/');
  if (!folders.some((folder) => rel.startsWith(`${folder}/`))) throw new Error(t.mcp.outsideScope(folders.join(', ')));
}

// Agents' changes: ~/.platanus/backups/<id>/meta.json ({ root, rel, created }) + the previous version.
// Main is the only source of truth for undo: the window only says which id to restore.
const BACKUPS = path.join(app.getPath('home'), '.platanus', 'backups');
async function backupFile(rel, abs, exists) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(BACKUPS, id);
  await fs.mkdir(dir, { recursive: true });
  if (exists) await fs.copyFile(abs, path.join(dir, 'previous'));
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ root: workspace.root, rel, created: !exists }));
  return { id };
}

// Undo an agent's change: put the previous version back, or delete a file the agent created (asks first)
ipcMain.handle('agent:undo', async (_e, { path: rel, backup } = {}) => {
  try {
    if (!backup?.id || !/^[\w-]+$/.test(backup.id)) throw new Error(t.mcp.cannotUndo);
    const dir = path.join(BACKUPS, backup.id);
    const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
    if (meta.root !== workspace.root || meta.rel !== rel) throw new Error(t.mcp.cannotUndo);
    const abs = await workspace.resolve(rel);
    await refuseSecretTarget(abs);
    if (!(await confirm(t.mcp.confirmUndo(rel), meta.created ? t.mcp.confirmUndoCreated : t.mcp.confirmUndoDetail))) throw new Error(t.mcp.writeRejected);
    if (meta.created) await workspace.remove(rel);
    else { // byte for byte: a deleted image or font comes back whole (a text read would corrupt it)
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.copyFile(path.join(dir, 'previous'), abs);
    }
    log('agent:undo', rel, true);
    return { ok: true };
  } catch (err) {
    log('agent:undo', rel, false, err.message);
    return { ok: false, error: err.message };
  }
});

// Private key of the local MCP server: created once, readable only by this user (0600)
async function mcpToken() {
  const file = path.join(app.getPath('userData'), 'mcp-token');
  try {
    const saved = (await fs.readFile(file, 'utf8')).trim();
    if (/^[a-f0-9]{48}$/.test(saved)) return saved;
  } catch { /* first run */ }
  const token = require('node:crypto').randomBytes(24).toString('hex');
  await fs.writeFile(file, token, { mode: 0o600 });
  return token;
}

async function startMcp() {
  const token = await mcpToken();
  const server = await startMcpServer({
    port: Number(process.env.PLATANUS_MCP_PORT) || 7811,
    token,
    handlers: mcpHandlers,
    // A worker's address exists only while its run lives: { folders, root } or null (404). With the root,
    // mcpServer.js also checks where the path really lands (links)
    scopeFor: (worker) => {
      const scope = workerScopes.get(worker);
      return scope && workspace.root ? { folders: [...scope.folders], root: workspace.root } : null;
    },
    onCall: ({ tool, args, ok, error }) => log(`mcp:${tool}`, args?.path ?? '', ok, error),
  });
  const url = `http://127.0.0.1:${server.address().port}/mcp/${token}`;
  // Plain data only: this object goes to the window over IPC (a worker's address is made by workerUrl)
  mcp = { url, readOnlyUrl: `${url}/ro`, running: true };
  mcpServer = server;
  send('mcp:status', mcp);
}

// The address of one worker of Qubi's team: the full tools, writes only inside its folders (mcpServer.js)
let mcpServer = null;
const workerUrl = (worker) => mcpServer?.workerUrl?.(worker) ?? `${mcp.url}/w/${worker}`;

ipcMain.handle('mcp:info', () => ({ ok: true, data: mcp }));

// --- Agents with the user's own subscription ---
// Agent permissions (approval.js). Starts in manual on every launch; the window restores "auto" itself,
// and "bypass" needs the person's confirmation each time it is turned on.
let approvalModeNow = 'manual';
const commandRunner = createCommandRunner();
ipcMain.handle('agent:approval', async (_e, requested) => {
  const mode = approvalMode(requested);
  if (mode === 'bypass' && approvalModeNow !== 'bypass' && !(await confirm(t.mcp.confirmBypass, t.mcp.confirmBypassDetail, t.mcp.bypassButton))) {
    return { ok: false, error: 'cancelled', data: approvalModeNow };
  }
  approvalModeNow = mode;
  log('agent:approval', mode, true);
  return { ok: true, data: mode };
});
// API keys instead of a subscription login (keyStore.js): encrypted with the OS keychain, never sent
// back to the window (only which agents have one and their last four characters)
// The ElevenLabs key of Qubi's call is kept here too ('elevenlabs'); devEnv (below) is the development
// fallback of the voice keys, read only by keyFor.
let keyStore = null;
const keys = () => (keyStore ??= createKeyStore({ file: path.join(app.getPath('home'), '.platanus', 'keys.json'), safeStorage, devEnv }));
ipcMain.handle('keys:list', () => ({ ok: true, data: keys().list() }));

// --- "Conectar mi cuenta": Supabase (supabaseConnect.js). Platanus does it, not the agent: the window only
// says which organization or project the person picked (checked against what Supabase listed), main asks
// in a native dialog, and the keys go straight to .env.local without ever reaching the window or an agent.
const SUPABASE_POLL_MS = 4000;
const SUPABASE_READY_MS = 5 * 60 * 1000;
let supabaseConnector = null;
const supabaseLink = () => (supabaseConnector ??= createSupabaseConnector({
  store: createSecretStore({ file: path.join(app.getPath('userData'), 'connections.json'), safeStorage }),
  openExternal: (url) => shell.openExternal(url),
  page: t.supabase.page,
  version: app.getVersion(),
}));
let supabaseChoices = { organizations: [], projects: [] }; // what Supabase listed last: the only valid picks

ipcMain.handle('supabase:start', async () => {
  if (!workspace.root) return { ok: false, error: t.mcp.noProject };
  try {
    await supabaseLink().signIn();
    supabaseChoices = { organizations: await supabaseLink().organizations(), projects: await supabaseLink().projects() };
    log('supabase:signin', workspace.root, true);
    return { ok: true, data: { ...supabaseChoices, suggested: projectNameFor(path.basename(workspace.root)) } };
  } catch (err) {
    log('supabase:signin', workspace.root, false, err.message);
    return { ok: false, error: err.message === 'timeout' ? t.supabase.signInFailed : err.message };
  }
});

// { mode: 'new', organizationId } or { mode: 'existing', projectId }
ipcMain.handle('supabase:connect', async (_e, choice = {}) => {
  const root = workspace.root;
  if (!root) return { ok: false, error: t.mcp.noProject };
  const link = supabaseLink();
  try {
    let project;
    if (choice.mode === 'new') {
      const org = supabaseChoices.organizations.find((o) => o.id === choice.organizationId);
      if (!org) return { ok: false, error: t.supabase.notChosen };
      const name = projectNameFor(path.basename(root));
      // Supabase says what it costs; the person sees it in the dialog and only then is it confirmed
      const cost = await link.cost(org.id);
      if (!(await confirm(t.supabase.confirmCreate(name, org.name), t.supabase.confirmCreateDetail(org.name, cost), t.supabase.create))) return { ok: false, cancelled: true };
      send('supabase:progress', { stage: 'creating' });
      project = await link.create({ name, organizationId: org.id, confirmCostId: await link.confirmCost(cost) });
      log('supabase:create', project.id, true);
    } else {
      project = supabaseChoices.projects.find((p) => p.id === choice.projectId);
      if (!project) return { ok: false, error: t.supabase.notChosen };
      if (!(await confirm(t.supabase.confirmUse(project.name), t.supabase.confirmUseDetail, t.supabase.use))) return { ok: false, cancelled: true };
    }
    // A new project takes a minute or two to be ready
    send('supabase:progress', { stage: 'starting' });
    const until = Date.now() + SUPABASE_READY_MS;
    while (!isReady(await link.project(project.id))) {
      if (Date.now() > until) return { ok: false, error: t.supabase.notReady };
      await new Promise((r) => setTimeout(r, SUPABASE_POLL_MS));
    }
    send('supabase:progress', { stage: 'keys' });
    const [url, key] = [await link.url(project.id), await link.publicKey(project.id)];
    if (!url || !key) return { ok: false, error: t.supabase.noKey };
    if (workspace.root !== root) return { ok: false, error: t.mcp.noProject }; // the person opened another project meanwhile
    const envPath = path.join(root, '.env.local');
    const before = await fs.readFile(envPath, 'utf8').catch(() => '');
    await fs.writeFile(envPath, mergeEnv(before, { [ENV_URL]: url, [ENV_KEY]: key }), { mode: 0o600 });
    const ignorePath = path.join(root, '.gitignore');
    const ignored = protectEnv(await fs.readFile(ignorePath, 'utf8').catch(() => ''));
    if (ignored) await fs.writeFile(ignorePath, ignored);
    log('supabase:connect', `${root} -> ${project.id}`, true);
    return { ok: true, data: { name: project.name, projectId: project.id, envFile: '.env.local' } };
  } catch (err) {
    log('supabase:connect', root, false, err.message);
    return { ok: false, error: err.message };
  }
});

// The database panel's numbers (fixed read-only queries; the window only names the project it connected)
ipcMain.handle('supabase:stats', async (_e, projectId) => {
  if (!isProjectRef(projectId)) return { ok: false, error: t.supabase.notChosen };
  if (!supabaseLink().signedIn()) return { ok: false, error: 'signed-out' };
  try {
    const stats = await supabaseLink().stats(projectId);
    return { ok: true, data: { ...stats, limitBytes: planLimitBytes(stats.plan) } };
  } catch (err) {
    log('supabase:stats', projectId, false, err.message);
    return { ok: false, error: err.message };
  }
});

// Which Supabase project the open folder already uses (connected before, or set up by hand): main reads the
// URL line of its env files and returns only the project ref, never a key
ipcMain.handle('supabase:linked', async () => {
  if (!workspace.root) return { ok: false, error: t.mcp.noProject };
  for (const name of ['.env.local', '.env']) {
    const ref = refFromEnv(await fs.readFile(path.join(workspace.root, name), 'utf8').catch(() => ''));
    if (ref) return { ok: true, data: { projectId: ref } };
  }
  return { ok: true, data: null };
});

// "Abrir en Supabase": main builds the dashboard address from a checked project ref
ipcMain.handle('supabase:dashboard', async (_e, projectId) => {
  if (!isProjectRef(projectId)) return { ok: false };
  await shell.openExternal(`https://supabase.com/dashboard/project/${projectId}`);
  return { ok: true };
});

ipcMain.handle('supabase:signOut', async () => {
  await supabaseLink().signOut();
  log('supabase:signout', '', true);
  return { ok: true };
});
// -> { ok: true, last4, reason?: 'weak-keychain' } | { ok: false, error } (the keychain answers asynchronously)
ipcMain.handle('keys:set', async (_e, provider, value) => {
  const result = await keys().set(String(provider), value);
  log('keys:set', String(provider), result.ok, result.error ?? result.reason); // the provider, never the key
  return result;
});
ipcMain.handle('keys:remove', (_e, provider) => {
  log('keys:remove', String(provider), true);
  return keys().remove(String(provider));
});
// The keys one run gets: its own, or for OpenCode every saved one (it picks the provider). Never the voice ones.
const agentKeyEnv = async (id) => (id === 'opencode'
  ? Object.assign({}, ...(await Promise.all(['claude', 'codex', 'grok'].map((p) => keys().envFor(p)))))
  : keys().envFor(id));
// An agent with a saved key counts as connected (auth: 'key'), even without a subscription login
ipcMain.handle('agents:detect', async () => {
  // only the agents' keys: the ElevenLabs one is for Qubi's voice, no agent CLI uses it
  const saved = Object.fromEntries(Object.entries(keys().list()).filter(([p]) => ['claude', 'codex', 'grok'].includes(p)));
  const list = (await agents.detect()).map((a) => {
    if (saved[a.id] && a.installed) return { ...a, loggedIn: true, auth: 'key', keyLast4: saved[a.id].last4 };
    // OpenCode can also use any key saved here (it reads the same provider variables)
    if (a.id === 'opencode' && a.installed && !a.loggedIn && Object.keys(saved).length) return { ...a, loggedIn: true, auth: 'key', keyLast4: Object.values(saved)[0].last4 };
    return { ...a, auth: a.loggedIn ? 'login' : null };
  });
  return { ok: true, data: list };
});
ipcMain.handle('agents:login', (_e, id) => ({ ok: agents.login(String(id)) }));
// Qubi's team: worker id -> { folders, runId } while its run lives. The worker's MCP address and its
// writes depend on it (scopeFor, refuseOutsideScope), so it is removed as soon as the run ends or is cancelled.
const workerScopes = new Map();
const endScope = (runId) => {
  for (const [worker, scope] of workerScopes) if (scope.runId === runId) workerScopes.delete(worker);
};

// The folders a worker may write in, from the window: 1 or 2 project folders, relative, without "..",
// never a secret (by name or through a link), existing as folders or not created yet. null when not valid.
async function workerScope(scope) {
  if (!Array.isArray(scope) || scope.length < 1 || scope.length > MAX_SCOPE_FOLDERS) return null;
  const folders = [];
  for (const raw of scope) {
    if (typeof raw !== 'string' || !raw || raw.length > MAX_SCOPE_CHARS || /\p{Cc}/u.test(raw)) return null;
    const slashed = raw.replace(/\\/g, '/');
    if (slashed.startsWith('/') || /^[a-zA-Z]:/.test(slashed) || path.isAbsolute(raw)) return null;
    if (slashed.split('/').includes('..')) return null;
    const folder = path.posix.normalize(slashed).replace(/\/+$/, '');
    if (!folder || folder === '.' || isBlockedPath(folder) || folders.includes(folder)) return null;
    try {
      const abs = await workspace.resolve(folder); // inside the open project, links included
      if (await isBlockedRealPath(workspace.root, abs)) return null;
      const stat = await fs.stat(abs).catch(() => null);
      if (stat && !stat.isDirectory()) return null;
    } catch {
      return null;
    }
    folders.push(folder);
  }
  return folders;
}

// A worker run needs its session, a matching id that is not already running, and valid folders; any
// other run must carry neither. -> { worker, folders } | { worker: null } | null (refused)
async function workerRequest(req, session) {
  const slot = WORKER_SESSION.exec(session)?.[1];
  if (!slot) return req?.worker == null && req?.scope == null ? { worker: null } : null;
  const id = typeof req?.worker === 'string' ? WORKER_ID.exec(req.worker) : null;
  if (!id || id[1] !== slot || workerScopes.has(req.worker)) return null;
  const folders = await workerScope(req.scope);
  return folders ? { worker: req.worker, folders } : null;
}

ipcMain.handle('agents:run', async (_e, req) => {
  if (!mcp.running) return { ok: false, error: t.mcp.windowClosed };
  const session = SESSIONS.includes(req?.session) ? req.session : 'chat';
  const team = await workerRequest(req, session);
  if (!team) {
    log('agents:run', session, false, 'invalid-worker');
    return { ok: false, error: t.agents.invalidWorker };
  }
  const { worker } = team;
  // The system proxy, asked on every run: VPN apps like Psiphon change their port each time they start
  const proxyEnv = agents.proxyEnvFor(await electronSession.defaultSession.resolveProxy('https://api.anthropic.com').catch(() => ''));
  const runId = `${Date.now()}-${++requestSeq}`;
  const model = /^(?!-)[a-zA-Z0-9.\-_]{0,40}$/.test(String(req?.model ?? '')) ? String(req.model ?? '') : '';
  const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(req?.effort) ? req.effort : 'low';
  // The chat sends its voice (Vibe/Dev + recent messages): the prompt comes from agent/voice.json and the
  // mode's skill, read on every run so the team can tune them without restarting
  let systemPrompt = String(req?.systemPrompt ?? '');
  if (req?.voice) {
    try {
      const voice = loadVoice(AGENT_DIR);
      systemPrompt = req.voice.purpose === 'refine'
        ? composeRefinePrompt(voice, { mode: req.voice.mode }) // "Mejorar mi mensaje"
        : req.voice.purpose === 'tour'
          ? composeTourPrompt(voice, { mode: req.voice.mode }) // "Recorrido"
          : composePrompt(voice, { mode: req.voice.mode, recent: req.voice.recent, task: systemPrompt });
    } catch (error) {
      console.error('agent/voice.json:', error.message); // keep the plain prompt
    }
  }
  // A tour, a review of Qubi's team or a question to understand only explains: its agent gets the
  // read-only address of the MCP server. A worker gets its own address (writes only inside its folders).
  const readOnly = session === 'tour' || session === 'review' || req?.readOnly === true;
  const mcpUrl = readOnly ? mcp.readOnlyUrl : worker ? workerUrl(worker) : mcp.url;
  // Workers and reviews start fresh every time: each task is its own conversation
  const continued = Boolean(req?.continued) && !readOnly && !worker;
  // The run's own key, if one was saved (the keychain answers asynchronously: awaited before the check below)
  const env = await agentKeyEnv(String(req?.agent)).catch(() => ({}));
  if (worker) {
    // checked again after the awaits above: two requests with the same id may have raced here
    if (workerScopes.has(worker)) return { ok: false, error: t.agents.invalidWorker };
    workerScopes.set(worker, { folders: team.folders, runId }); // before the run: its first call may come fast
  }
  let finished = false;
  const child = agents.run(
    String(req?.agent),
    { prompt: String(req?.prompt ?? ''), systemPrompt, mcpUrl, continued, model, effort, session, env, proxyEnv, ...(worker ? { worker, scope: team.folders } : {}) },
    (event) => {
      if (event.type === 'done') {
        finished = true;
        agentRuns.delete(runId);
        endScope(runId);
      }
      send('agents:event', { runId, ...(worker ? { worker } : {}), ...event });
    },
  );
  if (child && !finished) agentRuns.set(runId, child);
  return { ok: true, data: runId };
});

// Stop a run (Qubi's job was closed or timed out): its later writes never happen
const agentRuns = new Map(); // runId -> child process
ipcMain.handle('agents:cancel', (_e, runId) => {
  agentRuns.get(String(runId))?.kill('SIGTERM');
  endScope(String(runId)); // a cancelled worker can write nothing more, even before its process closes
  return { ok: true };
});

// --- Call with Qubi (voiceCall.js, docs/features/llamada/README.md and VOZ.md) ---
// The voice keys (ElevenLabs, or xAI for Grok Voice) come from the keychain (keyStore.keyFor), then the
// environment. In development they can also live in .env.local: only the voice variables are read from
// it, into this object and never into process.env, so agent CLIs and the servers Qubbot starts never
// inherit them. Values are never logged.
const VOICE_ENV = ['ELEVENLABS_API_KEY', 'XAI_API_KEY', 'PLATANUS_VOICE_ID', 'PLATANUS_VOICE_LLM', 'PLATANUS_VOICE_REALTIME'];
const devEnv = {};
if (!app.isPackaged) {
  const envFile = path.join(__dirname, '..', '.env.local');
  try {
    if (existsSync(envFile)) {
      const parsed = require('node:util').parseEnv(readFileSync(envFile, 'utf8'));
      for (const name of VOICE_ENV) if (parsed[name]) devEnv[name] = parsed[name];
    }
  } catch {
    console.error('.env.local: could not be read'); // never the content
  }
}
const voiceEnv = (name) => process.env[name] || devEnv[name] || null;
// Optional overrides of the agent's voice and model, checked so a typo cannot break its configuration
const voiceId = /^[A-Za-z0-9]{10,40}$/.test(voiceEnv('PLATANUS_VOICE_ID') ?? '') ? voiceEnv('PLATANUS_VOICE_ID') : undefined;
const voiceLlm = /^[\w.:-]{1,60}$/.test(voiceEnv('PLATANUS_VOICE_LLM') ?? '') ? voiceEnv('PLATANUS_VOICE_LLM') : undefined;
// Voice to voice (Realtime) by default; PLATANUS_VOICE_REALTIME=max for the model that reasons more, off
// for the classic voice (its LLM reads its answers aloud)
const REALTIME = { mini: 'eleven_realtime_v1_mini', max: 'eleven_realtime_v1_max', off: null };
const realtimeChoice = voiceEnv('PLATANUS_VOICE_REALTIME') ?? 'mini';
const realtime = Object.hasOwn(REALTIME, realtimeChoice) ? REALTIME[realtimeChoice] : REALTIME.mini;
let voiceCall = null;
const voice = () => (voiceCall ??= createVoiceCall({
  // provider: 'elevenlabs' | 'grok' -> its key or null (keychain, then process.env, then devEnv)
  getKey: (provider) => keys().keyFor(provider),
  file: path.join(app.getPath('userData'), 'voice-agent.json'), // { agentId, hash, voiceMode, voices }: never the key
  voiceId,
  llm: voiceLlm,
  realtime,
}));

// The window's request: strings within their limits, or nothing is done. The project memory is optional
// (phase 3: an older window, or a project with nothing remembered, sends none). provider is one of
// voiceCall's PROVIDERS ('auto' when missing) and voice a key of its VOICES list, never a free id.
const OPTIONAL_VOICE = new Set(['memory']);
const VOICE_KEYS = new Set(Object.values(VOICES).flatMap((group) => Object.keys(group)));
function voiceRequest(req) {
  if (!req || typeof req !== 'object') return null;
  const fields = Object.entries(VOICE_LIMITS).filter(([name]) => !(OPTIONAL_VOICE.has(name) && req[name] == null));
  if (!fields.every(([name, max]) => typeof req[name] === 'string' && req[name].length <= max)) return null;
  const provider = req.provider ?? 'auto';
  if (!VOICE_PROVIDERS.includes(provider)) return null;
  if (req.voice != null && !(typeof req.voice === 'string' && VOICE_KEYS.has(req.voice))) return null;
  if (req.level != null && !VOICE_LEVELS.includes(req.level)) return null;
  if (req.style != null && !VOICE_STYLES.includes(req.style)) return null;
  return { ...Object.fromEntries(fields.map(([name]) => [name, req[name]])), provider, ...(req.voice != null ? { voice: req.voice } : {}), ...(req.level != null ? { level: req.level } : {}), ...(req.style != null ? { style: req.style } : {}) };
}

ipcMain.handle('voice:status', () => voice().status());
// -> { elevenlabs: { ready, last4? }, grok: { ready, last4? } } (never a key)
ipcMain.handle('voice:providers', () => voice().providers());
ipcMain.handle('voice:start', async (_e, req) => {
  const valid = voiceRequest(req);
  if (!valid) {
    log('voice:start', '', false, 'invalid');
    return { ok: false, reason: 'failed' };
  }
  const result = await voice().start(valid);
  // ElevenLabs or Grok: opens the short window in which the microphone is allowed
  if (result.ok) callStartedAt = Date.now();
  log('voice:start', `${valid.projectName.slice(0, 60)} · ${result.provider ?? valid.provider}`, result.ok, result.reason); // never the key
  return result;
});

// "Iniciar sesión con ElevenLabs" (elevenlabsLogin.js): its CLI opens the browser; the key it hands over
// goes straight to the keychain, and the window only gets its last four characters
let elevenLabsLogin = null;
const voiceLogin = () => (elevenLabsLogin ??= require('./elevenlabsLogin').createElevenLabsLogin({
  dir: app.getPath('userData'),
  saveKey: (key) => keys().set('elevenlabs', key),
  log: ({ reason, key_status: status, next }) => log('voice:login', '', reason ? reason === 'ok' : true, reason ?? [status, next].filter(Boolean).join(' · ')),
}));
ipcMain.handle('voice:login', () => voiceLogin().login().catch(() => ({ ok: false, reason: 'failed' })));
ipcMain.handle('voice:loginCancel', () => (elevenLabsLogin ? elevenLabsLogin.cancel() : { ok: true }));
// A login folder can hold a key: one left by a crash or a forced quit is removed when Qubbot starts
app.whenReady().then(() => require('./elevenlabsLogin').sweepLogins(app.getPath('userData')));

// --- Services the project uses (serviceStatus.js, docs/features/servicios/README.md) ---
// Detected from the open project's files (never .env) and checked against the agents' MCP configs and the
// services' CLIs. Cached 60 s per project; refresh empties the cache ("Ya lo conecté").
let serviceStatus = null;
const services = () => (serviceStatus ??= createServiceStatus({ home: app.getPath('home') }));
ipcMain.handle('services:detect', async () => {
  if (!workspace.root) return { ok: false, error: t.services.noProject };
  try {
    const found = await services().check(workspace.root);
    // ElevenLabs: the voice key Qubbot itself holds (keychain or environment) is access too
    const voiceKey = found.some((s) => s.key === 'elevenlabs' && s.state !== 'connected')
      && Boolean(await keys().keyFor('elevenlabs').catch(() => null));
    return { ok: true, data: voiceKey ? found.map((s) => (s.key === 'elevenlabs' ? { ...s, state: 'connected', via: [...(s.via ?? []), 'qubbot'] } : s)) : found };
  } catch (err) {
    log('services:detect', workspace.root, false, err?.message);
    return { ok: false, error: t.services.failed };
  }
});
ipcMain.handle('services:catalog', () => ({ ok: true, data: publicCatalog() }));
ipcMain.handle('services:refresh', () => {
  services().clear();
  return { ok: true };
});

// Pages of the catalog and of the voice connection, in the person's browser: only the fixed list (LINKS)
ipcMain.handle('links:open', async (_e, url) => {
  if (typeof url !== 'string' || !LINKS.has(url)) {
    log('links:open', String(url ?? '').slice(0, 80), false, 'refused');
    return { ok: false, error: t.links.refused };
  }
  try {
    await shell.openExternal(url);
    log('links:open', url, true);
    return { ok: true };
  } catch {
    log('links:open', url, false, 'failed');
    return { ok: false, error: t.links.failed };
  }
});

// --- Project memory (projectMemory.js, phase 3 of the call): what Qubi remembers between calls ---
// Only for the open project or a recent one (folders the person already chose), so the window cannot
// make Qubbot keep files about any path. Answers the memory itself: { calls, learned }.
let projectMemory = null;
const memory = () => (projectMemory ??= createProjectMemory({ dir: path.join(app.getPath('userData'), 'memory') }));
const EMPTY_MEMORY = () => ({ calls: [], learned: [] });

async function memoryRoot(root) {
  if (typeof root !== 'string' || !root || root.length > 4096) return null;
  if (root === workspace.root || (await readRecent()).some((r) => r.root === root)) return root;
  return null;
}

// Runs one memory operation for a valid root and logs the writes; null when refused or failed
function memoryAction(channel, fn, { audited = true, fallback = () => null } = {}) {
  ipcMain.handle(channel, async (_e, root, ...rest) => {
    const valid = await memoryRoot(root);
    try {
      const result = valid ? fn(valid, ...rest) : null;
      if (audited) log(channel, valid ?? '', result != null, valid ? (result == null ? 'invalid' : undefined) : 'not-a-project');
      return result ?? fallback();
    } catch (err) {
      if (audited) log(channel, valid ?? '', false, err.message);
      return fallback();
    }
  });
}

memoryAction('memory:read', (root) => memory().read(root), { audited: false, fallback: EMPTY_MEMORY });
memoryAction('memory:append', (root, entry) => memory().append(root, entry)); // -> memory | null (invalid entry)
memoryAction('memory:learn', (root, facts) => memory().learn(root, facts)); // -> memory | null (invalid facts)
memoryAction('memory:forget', (root) => (memory().forget(root), true), { fallback: () => false });

// --- Security audit (securityAudit.js + securityStore.js, docs/features/seguridad/README.md) ---
// Always about the open project. The window asks for a full audit when a project opens or the person
// asks, and for the files that changed on disk (fs:changed). Answers { at, files, counts, score,
// history, truncated }: lights and rule names per file, never contents.
let securityService = null;
const security = () => (securityService ??= createSecurityService({ store: createSecurityStore({ dir: path.join(app.getPath('userData'), 'security') }) }));
const SECURITY_CAUSES = ['open', 'audit', 'change', 'repair'];
const relPathOk = (rel) => typeof rel === 'string' && rel.length > 0 && rel.length < 1024 && !rel.includes('\0')
  && !path.isAbsolute(rel) && !/^[a-zA-Z]:/.test(rel) && !rel.replace(/\\/g, '/').split('/').includes('..');
const securityRoot = () => {
  if (!workspace.root) throw new Error(t.mcp.noProject);
  return workspace.root;
};
handle('security:audit', 'security-audit', (cause) => security().full(securityRoot(), SECURITY_CAUSES.includes(cause) ? cause : 'audit'));
handle('security:check', 'security-check', (paths, cause) => {
  const list = (Array.isArray(paths) ? paths : []).filter(relPathOk).map((p) => p.replace(/\\/g, '/'));
  return security().check(securityRoot(), list, SECURITY_CAUSES.includes(cause) ? cause : 'change');
});
handle('security:accept', 'security-accept', (rel) => {
  if (!relPathOk(rel)) throw new Error(t.cannotOpen);
  return security().accept(securityRoot(), rel);
});
handle('security:unaccept', 'security-unaccept', (rel) => {
  if (!relPathOk(rel)) throw new Error(t.cannotOpen);
  return security().unaccept(securityRoot(), rel);
});

// Approval dialogs wait in line: with Qubi's team several workers can ask at once, and two native
// dialogs on top of each other would be confusing (and the second could hide the first).
// stillValid: asked when the turn comes; a question that no longer applies is answered "no" unseen.
let dialogLine = Promise.resolve();
function confirm(message, detail, okLabel = t.allow, stillValid = () => true) {
  const turn = dialogLine.then(() => (stillValid() ? showConfirm(message, detail, okLabel) : false));
  dialogLine = turn.catch(() => {});
  return turn;
}

// With the simulator (PLATANUS_SIM=1, development) a question nobody answers cancels itself after 5 s,
// so automated scenario runs never hang on a dialog (the 5 s start when the dialog opens, not in line)
async function showConfirm(message, detail, okLabel) {
  const signal = process.env.PLATANUS_SIM === '1' ? AbortSignal.timeout(5000) : undefined;
  // While it is open, the window's hand cursor selects nothing (spec/003-hand-gestures.md, B21)
  send('dialog:state', true);
  try {
    const { response } = await dialog.showMessageBox(win, {
      ...(signal ? { signal } : {}),
      type: 'warning',
      buttons: [t.cancel, okLabel],
      defaultId: 0,
      cancelId: 0,
      message,
      detail,
    });
    return response === 1;
  } finally {
    send('dialog:state', false);
  }
}

// `npx electron . --open=/path/to/project` opens that folder at start (the window restores it)
const openArg = process.argv.find((a) => a.startsWith('--open='))?.slice('--open='.length);

// The app's own menus (Archivo, Ver, Agente…) live inside the window. The native bar keeps only what the
// system needs: the app menu, Edición (so Cmd+C / Cmd+V / Cmd+Z work in the chat) and Ventana.
// Keep the data folder where it always was (choices, stats, repair history, recent projects, MCP key):
// renaming the app would otherwise move it and the app would start as new.
app.setPath('userData', path.join(app.getPath('appData'), 'platanus-ide'));
app.setName('Qubbot');
// macOS: the Project menu lives in the system menu bar (the window hides its own). Each item asks
// the window to run the same action as its in-app button. Rebuilt when a project opens or closes,
// so "Close project" and the recent list stay current.
const menuAction = (action, extra = {}) => () => send('menu:action', { action, ...extra });

async function projectMenu() {
  const m = t.menu;
  const recent = await aliveRecent();
  return {
    label: m.project,
    submenu: [
      { label: m.newProject, accelerator: 'CmdOrCtrl+N', click: menuAction('newProject') },
      { label: m.openProject, accelerator: 'CmdOrCtrl+O', click: menuAction('openProject') },
      {
        label: m.openRecent,
        submenu: recent.length
          ? recent.map((r) => ({ label: r.name, sublabel: r.root, click: menuAction('openRecent', { root: r.root }) }))
          : [{ label: m.noRecent, enabled: false }],
      },
      { type: 'separator' },
      { label: m.closeProject, accelerator: 'CmdOrCtrl+W', enabled: Boolean(workspace.root), click: menuAction('closeProject') },
    ],
  };
}

function refreshMenu() {
  nativeMenu().catch((err) => log('menu', null, false, err.message));
}

async function nativeMenu() {
  const m = t.menu;
  const isMac = process.platform === 'darwin';
  const editItems = [
    { role: 'undo', label: m.undo },
    { role: 'redo', label: m.redo },
    { role: 'cut', label: m.cut },
    { role: 'copy', label: m.copy },
    { role: 'paste', label: m.paste },
    { role: 'selectAll', label: m.selectAll },
  ];
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'Qubbot',
      submenu: [
        { role: 'about', label: m.about },
        { type: 'separator' },
        { role: 'hide', label: m.hide },
        { role: 'hideOthers', label: m.hideOthers },
        { role: 'unhide', label: m.unhide },
        { type: 'separator' },
        { role: 'quit', label: m.quit },
        ...editItems.map((item) => ({ ...item, visible: false, acceleratorWorksWhenHidden: true })),
      ],
    }] : []),
    ...(isMac ? [await projectMenu()] : []),
    // macOS fills any Edit menu with Writing Tools, AutoFill, Dictation and Emoji, so on the Mac
    // there is no Edit menu: its shortcuts live as hidden items of the app menu and keep working
    ...(isMac ? [] : [{ label: m.edit, submenu: editItems }]),
    {
      label: m.window,
      submenu: [
        { role: 'minimize', label: m.minimize },
        { role: 'zoom', label: m.zoom },
        { role: 'togglefullscreen', label: m.fullscreen },
        ...(process.argv.includes('--dev') || LIVE_RELOAD ? [
          { role: 'reload', label: m.reload },
          { role: 'toggleDevTools', label: m.devTools },
        ] : []),
        { type: 'separator' },
        // ⌘W closes the project (Project menu); the window closes with ⇧⌘W
        { role: 'close', label: m.close, accelerator: isMac ? 'Shift+CmdOrCtrl+W' : 'CmdOrCtrl+W' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// `npm run watch`: live reload while developing. Changes in renderer/ reload the window (the open
// project is restored by the window itself); changes in electron/ restart the whole app.
const LIVE_RELOAD = process.argv.includes('--watch');
const RELOAD_DEBOUNCE_MS = 150;

function watchSources() {
  const watchFs = require('node:fs');
  const watch = (dir, onChange) => {
    let timer = null;
    watchFs.watch(path.join(__dirname, '..', dir), { recursive: true }, (_event, file) => {
      if (!file || file.endsWith('.test.js') || file.includes('.DS_Store')) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, RELOAD_DEBOUNCE_MS);
    });
  };
  watch('renderer', () => win && !win.isDestroyed() && win.webContents.reloadIgnoringCache());
  watch('electron', () => { app.relaunch(); app.exit(0); });
}

app.whenReady().then(async () => {
  await nativeMenu();
  if (LIVE_RELOAD) watchSources();
  if (openArg) await openWorkspace(openArg).catch((err) => log('workspace:open', openArg, false, err.message));
  createWindow();
  startMcp();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Closing from the system (kill, logout, a dev restart) quits normally, so the window's saved data
// (chosen agent, stats, repair history, Vibe/Dev) is written to disk instead of being lost
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => app.quit());

// Nothing stays frozen or hidden after Qubbot closes: every server it paused continues, and every
// server it started (which has no terminal) is stopped
app.on('will-quit', () => {
  servers.resumeAll(pausedPids);
  managedServers.stopAll();
  elevenLabsLogin?.quit(); // a login still waiting for the browser must not outlive the app
});

app.on('window-all-closed', () => {
  workspace.unwatch();
  if (process.platform !== 'darwin') app.quit();
});
