// Bridge between the window and the main process. The page can only use what is exposed here,
// e.g. window.platanus.mkdir('src'), never Node or the disk directly.

const { contextBridge, ipcRenderer } = require('electron');

// Lets the CSS leave room for the macOS window buttons and hide the in-app menu, which lives in the
// system menu bar on macOS (see styles/shell.css)
window.addEventListener('DOMContentLoaded', () => {
  if (process.platform === 'darwin') document.documentElement.classList.add('is-mac');
});

const on = (channel) => (callback) => {
  const listener = (_e, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('platanus', {
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  createWorkspace: () => ipcRenderer.invoke('workspace:create'),
  currentWorkspace: () => ipcRenderer.invoke('workspace:current'),
  closeWorkspace: () => ipcRenderer.invoke('workspace:close'),
  // Trusted folder: trust(false) tells whether the open one is; trust(true) asks the person (native dialog)
  trustWorkspace: (ask) => ipcRenderer.invoke('workspace:trust', Boolean(ask)),
  untrustWorkspace: () => ipcRenderer.invoke('workspace:untrust'),
  // "Conectar mi cuenta" with Supabase: main signs in, asks and writes the keys; the page only picks
  supabaseStart: () => ipcRenderer.invoke('supabase:start'),
  supabaseConnect: (choice) => ipcRenderer.invoke('supabase:connect', choice),
  supabaseSignOut: () => ipcRenderer.invoke('supabase:signOut'),
  supabaseStats: (projectId) => ipcRenderer.invoke('supabase:stats', projectId),
  supabaseLinked: () => ipcRenderer.invoke('supabase:linked'), // { projectId } from the env files, or null
  supabaseDashboard: (projectId) => ipcRenderer.invoke('supabase:dashboard', projectId),
  onSupabaseProgress: on('supabase:progress'), // { stage: 'creating' | 'starting' | 'keys' }
  recentWorkspaces: () => ipcRenderer.invoke('workspace:recent'),
  openRecentWorkspace: (root) => ipcRenderer.invoke('workspace:openRecent', root),

  tree: (rel = '.') => ipcRenderer.invoke('fs:tree', rel),
  read: (rel) => ipcRenderer.invoke('fs:read', rel),
  open: (rel, how) => ipcRenderer.invoke('fs:open', rel, how), // how: 'default' (browser…) | 'reveal'
  kind: (rel) => ipcRenderer.invoke('fs:kind', rel), // 'file' | 'dir' | null
  mkdir: (rel) => ipcRenderer.invoke('fs:mkdir', rel),
  write: (rel, content) => ipcRenderer.invoke('fs:write', rel, content),
  remove: (rel) => ipcRenderer.invoke('fs:delete', rel),
  // Editor: { content, mtime, secret }; a save is refused if the file changed since that mtime
  openFile: (rel) => ipcRenderer.invoke('editor:open', rel),
  saveFile: (rel, content, mtime) => ipcRenderer.invoke('editor:save', rel, content, mtime),

  gitHistory: () => ipcRenderer.invoke('git:history'),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitRevert: (sha) => ipcRenderer.invoke('git:revert', sha),
  gitReset: (sha) => ipcRenderer.invoke('git:reset', sha),
  gitCreateBranch: (name) => ipcRenderer.invoke('git:createBranch', name),
  gitCheckout: (target) => ipcRenderer.invoke('git:checkout', target),
  onGitChanged: on('git:changed'), // ({ op, sha?, name?, target?, data }) => ...

  auditLog: () => ipcRenderer.invoke('audit:list'),

  // Servers listening on this computer: list, open at http://localhost:<port> (default browser, an installed
  // one by id, or 'other' to pick an app) and stop (the main process asks first)
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    browsers: () => ipcRenderer.invoke('servers:browsers'),
    open: (port, browser) => ipcRenderer.invoke('servers:open', port, browser),
    stop: (port) => ipcRenderer.invoke('servers:stop', port),
    pause: (port) => ipcRenderer.invoke('servers:pause', port),
    resume: (port) => ipcRenderer.invoke('servers:resume', port),
    // Stopped from Qubbot: reactivate inside the app (asks first), cancel a start or forget, by the id
    // the main process gave; output of a server Qubbot started, by port or by that id
    stopped: () => ipcRenderer.invoke('servers:stopped'),
    restart: (id) => ipcRenderer.invoke('servers:restart', id),
    cancelStart: (id) => ipcRenderer.invoke('servers:cancelStart', id),
    forget: (id) => ipcRenderer.invoke('servers:forget', id),
    output: (key) => ipcRenderer.invoke('servers:output', key),
  },

  // The user's own agent (subscription CLIs) and the local MCP server it talks to
  // API keys: the window can save or remove one, and list which agents have one (never the key back)
  keys: {
    list: () => ipcRenderer.invoke('keys:list'),
    set: (provider, value) => ipcRenderer.invoke('keys:set', provider, value),
    remove: (provider) => ipcRenderer.invoke('keys:remove', provider),
  },
  agents: {
    detect: () => ipcRenderer.invoke('agents:detect'),
    login: (id) => ipcRenderer.invoke('agents:login', id),
    // req goes as is: { agent, prompt, session, readOnly, voice, …, worker, scope } (main validates every
    // field; a worker of Qubi's team carries session 'worker-N', its id and 1-2 folders)
    run: (req) => ipcRenderer.invoke('agents:run', req),
    cancel: (runId) => ipcRenderer.invoke('agents:cancel', runId),
    onEvent: on('agents:event'), // ({ runId, worker?, type: 'text'|'tool'|'error'|'done', ... }) => ...
  },
  mcp: {
    info: () => ipcRenderer.invoke('mcp:info'),
    onStatus: on('mcp:status'),
    onRequest: on('mcp:request'), // ({ id, tool, args }) => reply({ id, ok, data | error })
    reply: (payload) => ipcRenderer.invoke('mcp:reply', payload),
    onScore: on('agent:score'), // ({ path, level, reason }) => ...
    onChanged: on('agent:changed'), // ({ path, reason, created, backup, at, worker? }) => ...
    onAwaiting: on('agent:awaiting'), // ({ path, waiting, worker? }) => ... while the person is asked to approve a change
    undo: (change) => ipcRenderer.invoke('agent:undo', change),
    setApproval: (mode) => ipcRenderer.invoke('agent:approval', mode), // 'manual' | 'auto' | 'bypass'
  },
  // Call with Qubi (ElevenLabs or Grok Voice): whether a voice service is ready ({ ready, reason? }), each
  // provider's state ({ elevenlabs: { ready, last4? }, grok: { ready, last4? } }) and what the window needs
  // to talk (a signed URL or a short-lived token, docs/features/llamada/VOZ.md); the keys stay in main
  voice: {
    status: () => ipcRenderer.invoke('voice:status'),
    // { projectName, context, builder, memory?, provider?: 'auto'|'elevenlabs'|'grok', voice?: a key of the voice list }
    start: (req) => ipcRenderer.invoke('voice:start', req),
    providers: () => ipcRenderer.invoke('voice:providers'),
    // ElevenLabs sign-in in the browser -> { ok: true, last4 } | { ok: false, reason }
    login: () => ipcRenderer.invoke('voice:login'),
    loginCancel: () => ipcRenderer.invoke('voice:loginCancel'),
  },
  // Official pages of the services and of the voice keys: main opens only the URLs of its fixed list
  links: {
    open: (url) => ipcRenderer.invoke('links:open', url),
  },
  // Starting the open project (Qubi's ejecutar_app): its dev/start scripts, and one of them by id
  // (main asks with its own dialog first) -> { ok, port?, reason? }
  run: {
    scripts: () => ipcRenderer.invoke('run:scripts'),
    start: (id) => ipcRenderer.invoke('run:start', id),
  },
  // External services the open project uses and whether the person's agent can work with them
  services: {
    detect: () => ipcRenderer.invoke('services:detect'), // { ok, data: [{ key, name, state, via, evidence }] }
    catalog: () => ipcRenderer.invoke('services:catalog'), // { ok, data: { [key]: { name, cli, mcp, dashboard } } }
    refresh: () => ipcRenderer.invoke('services:refresh'),
  },
  // What Qubi remembers of a project between calls (only the open project or a recent one):
  // Security audit of the open project (securityAudit.js): each answers { ok, data: { at, files, counts,
  // score, history, truncated } }; accept answers { ok, data: { ok, reason?, audit? } }
  security: {
    audit: (cause) => ipcRenderer.invoke('security:audit', cause), // 'open' | 'audit' | 'repair'
    check: (paths, cause) => ipcRenderer.invoke('security:check', paths, cause), // the files that changed
    accept: (rel) => ipcRenderer.invoke('security:accept', rel),
    unaccept: (rel) => ipcRenderer.invoke('security:unaccept', rel),
  },
  // read -> { calls, learned }; append / learn -> that memory, or null if refused; forget -> true | false
  memory: {
    read: (root) => ipcRenderer.invoke('memory:read', root),
    append: (root, entry) => ipcRenderer.invoke('memory:append', root, entry), // { at, pedidos, built, audits, notes }
    learn: (root, facts) => ipcRenderer.invoke('memory:learn', root, facts), // [string]
    forget: (root) => ipcRenderer.invoke('memory:forget', root),
  },
  // Arduino lab (electron/lab.js): the bench's design file and its exports; the window never sees a path
  // load -> { ok, data: text | null }; save(text) -> { ok, data: { dropped } | error }; export(kind: 'stl' (base64) |
  // 'scad' | 'ino', content) -> { ok, data: { file } }
  lab: {
    load: () => ipcRenderer.invoke('lab:load'),
    save: (text) => ipcRenderer.invoke('lab:save', text),
    export: (kind, content) => ipcRenderer.invoke('lab:export', kind, content),
  },
  onMenuAction: on('menu:action'), // ({ action: 'newProject'|'openProject'|'openRecent'|'closeProject', root? }) => ...
  onChanged: on('fs:changed'), // (paths) => ...
  onDialog: on('dialog:state'), // (open) => ... a confirmation dialog of the main process is open
  dev: process.argv.includes('--platanus-dev'), // npm run dev (dev-only readouts)
  onAudit: on('audit'),        // (entry) => ...
});
