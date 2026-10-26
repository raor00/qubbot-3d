// Local MCP server (Streamable HTTP, JSON responses, stateless) so the user's own agent
// (Claude Code, Cursor, Codex, Gemini CLI, or the CLIs launched from the chat) can work with Qubbot.
// Only listens on 127.0.0.1 and rejects browser requests (Origin header), so a web page cannot use it.

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const lab = require('./lab');

const PROTOCOL_VERSION = '2025-06-18';
const MAX_BODY = 256 * 1024;

// Files and folders an agent must never read or write: secrets, private keys, credentials and git
// internals. Checked on every segment of the NORMALIZED path (so ".env/", "x/../.env" or "./.env/."
// are caught), and main.js checks the real path too (symlinks).
const BLOCKED_SEGMENT = /^(\.env(\..*)?|\.git|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|\.pypirc|\.docker|\.htpasswd|credentials(\.json)?|secrets?\.(json|ya?ml|toml)|service[-_]?account[^/]*\.json|id_(rsa|ed25519|ecdsa|dsa)[^/]*|[^/]+\.(pem|key|p12|pfx|keystore|jks))$/i;
const ALLOWED_ENV_TEMPLATE = /^\.env\.(example|sample|template)$/i;
const MAX_READ_BYTES = 200 * 1024;

// Qubi's team (docs/features/llamada/FASE2.md): each worker has its own address /mcp/<token>/w/<id>
// and may only write inside its folders. The refusal is read by the coding agent, in plain Spanish
// (strings.js belongs to the window texts; this one never reaches the person).
const WORKER_ID = /^w[1-3]-[a-z0-9]{4,12}$/;
const OUTSIDE_SCOPE = (folders) =>
  `Rechazado: en esta tarea solo puedes escribir dentro de ${folders.map((f) => `${f}/`).join(' o ')}. ` +
  'Usa una ruta relativa que empiece por esa carpeta, sin "..". Lo demás del proyecto lo hacen otros.';

function isBlockedPath(rel) {
  const normalized = path.posix.normalize(String(rel).replace(/\\/g, '/'));
  return normalized.split('/').some((seg) => BLOCKED_SEGMENT.test(seg) && !ALLOWED_ENV_TEMPLATE.test(seg));
}

// Where an absolute path really lands (symlinks resolved, also for a file that does not exist yet: its
// nearest existing parent is resolved and the rest of the path added)
async function realPathOf(abs) {
  let probe = abs;
  const rest = [];
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) {
    rest.unshift(path.basename(probe));
    probe = path.dirname(probe);
  }
  return path.join(await fs.promises.realpath(probe).catch(() => probe), ...rest);
}

// Where an absolute path really lands inside `root`, checked against the same blocklist.
async function isBlockedRealPath(root, abs) {
  return isBlockedPath(path.relative(root, await realPathOf(abs)).split(path.sep).join('/'));
}

// A worker's write: a relative path with no "..", written inside one of its folders (exact case: a
// different case could be another folder) and, when the project root is known, really landing inside
// that folder too (a symlink inside the folder cannot lead out of it).
async function isInScope(rel, { folders = [], root = null } = {}) {
  const raw = String(rel ?? '').replace(/\\/g, '/');
  if (!raw || raw.includes('\0') || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw) || raw.endsWith('/')) return false;
  if (raw.split('/').includes('..')) return false;
  const target = path.posix.normalize(raw);
  const clean = (f) => path.posix.normalize(String(f ?? '').replace(/\\/g, '/')).replace(/\/+$/, '');
  const matches = (Array.isArray(folders) ? folders : [])
    .map(clean)
    .filter((f) => f && f !== '.' && !f.startsWith('/') && !f.split('/').includes('..'))
    .filter((f) => target.startsWith(`${f}/`));
  if (!matches.length) return false;
  if (!root) return true;
  const real = await realPathOf(path.join(root, target));
  const inProject = path.relative(await realPathOf(root), real);
  if (!inProject || inProject.startsWith('..') || path.isAbsolute(inProject)) return false; // a folder that is a link out
  for (const folder of matches) {
    const inside = path.relative(await realPathOf(path.join(root, folder)), real);
    if (inside && !inside.startsWith('..') && !path.isAbsolute(inside)) return true;
  }
  return false;
}

const TOOLS = [
  {
    name: 'platanus_get_project',
    description: 'Returns the open project: its name and folder tree (paths only, up to 4 levels).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_list_risks',
    description: 'Lists files whose security traffic light is red (risk) or yellow (review), with the reason.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_read_file',
    description: 'Reads a text file of the project. Secrets (.env, private keys) and files over 200 KB are refused.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the project root' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_write_file',
    description: 'Writes a text file of the project (the whole new content). The user must approve every write in a dialog, and the previous version is backed up so it can be undone. Explain the change in `reason` in plain Spanish.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project root' },
        content: { type: 'string', description: 'Full new content of the file' },
        reason: { type: 'string', maxLength: 300, description: 'What you changed and why, in one or two plain sentences' },
      },
      required: ['path', 'content', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_set_file_score',
    description: "Flags a file on the map: yellow (review) or red (risk), with a short reason in plain Spanish. Qubbot' fixed security audit decides the lights: a flag can only raise a file's light, and green never hides a finding of the audit (fix the code instead; Qubbot audits it again after each change).",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        level: { type: 'string', enum: ['green', 'yellow', 'red'] },
        reason: { type: 'string', maxLength: 240 },
      },
      required: ['path', 'level', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_run_command',
    description: "Runs ONE command in the open project (no shell: no pipes, redirections, ; or &&) and returns its exit code and output (keys covered). Allowed: npm/pnpm/yarn/bun (install, add, remove, run <script>, test, audit…), npx <package>, node/python <a script of the project>, tsc/eslint/prettier/vitest/jest/playwright of the project, read-only git (status, diff, log, show) and `git rm --cached <file>` (take a committed key file out of the repository, keeping it on disk). Never global installs (-g): use npx instead. Commands that can change the project ask the user first unless they chose otherwise. Explain why in `reason` in plain Spanish.",
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', maxLength: 500, description: 'The command, e.g. "npm install zod" or "npx @elevenlabs/cli --version"' },
        folder: { type: 'string', description: 'Folder of the project to run it in, relative to the root (default: the root)' },
        reason: { type: 'string', maxLength: 300, description: 'Why, in one plain sentence' },
      },
      required: ['command', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_delete_file',
    description: 'Deletes a file of the project. The previous version is backed up so it can be undone; the user approves it unless they chose otherwise. Secrets are refused. Explain why in `reason` in plain Spanish.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project root' },
        reason: { type: 'string', maxLength: 300 },
      },
      required: ['path', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_show_folder',
    description: "Opens a folder's building on the map so the user sees what you are talking about. Use an empty path for the whole map.",
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_lab_catalog',
    description: "Lists the parts of the Arduino lab's catalog (id, name, type, voltage, consumption and pin names). Read it before adding parts to the bench.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_lab_view',
    description: "Shows the lab's bench: every part with its id, its wires, and the checker's findings in plain Spanish (red = danger, yellow = to review).",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_lab_add_part',
    description: "Puts a part of the catalog on the lab's bench (saved in laboratorio/circuito.json; the user approves it like any write). `near` is the id of a part to place it beside. Returns the new part's id.",
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Catalog id, e.g. "hc-sr04" or "arduino-uno"' },
        near: { type: 'string', description: 'Id of a part already on the bench, e.g. "arduino-uno-1"' },
      },
      required: ['type'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_lab_connect',
    description: "Wires two pins on the lab's bench, written as part.pin (e.g. from \"hc-sr04-1.TRIG\" to \"arduino-uno-1.D2\"). The fixed checker decides: a wire that would make the circuit red (short, wrong voltage) is refused. Saved like a write the user approves.",
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'part.pin' },
        to: { type: 'string', description: 'part.pin' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_lab_auto_wire',
    description: "Wires a part (or every part, when `part` is left out) to the board with the right pins: power, ground and one free signal pin each. Saved like a write the user approves.",
    inputSchema: {
      type: 'object',
      properties: { part: { type: 'string', description: 'Id of the part to wire; omit for all' } },
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_lab_remove',
    description: "Removes a part (with its wires) or a single wire from the lab's bench. Give `part` or `wire`, not both. Saved like a write the user approves.",
    inputSchema: {
      type: 'object',
      properties: {
        part: { type: 'string', description: 'Id of the part to remove' },
        wire: { type: 'string', description: 'Id of the wire to remove, e.g. "w3"' },
      },
      additionalProperties: false,
    },
  },
];

const text = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  isError,
});

// Tools a read-only run may use (the tour of a project: it explains, it never changes anything)
const READ_ONLY_TOOLS = ['platanus_get_project', 'platanus_list_risks', 'platanus_read_file', 'platanus_lab_catalog', 'platanus_lab_view'];

// `handlers` implement the tools (they live in main.js, next to the workspace and the window); each one
// is called as handler(args, context), and context.worker says which of Qubi's workers asked.
// Every call is reported through `onCall({ tool, args, ok, error, worker? })` for the audit log.
// readOnly: only READ_ONLY_TOOLS are listed, and any other call is refused.
// scope ({ folders, root? }): platanus_write_file only inside those folders (a worker's address).
// A worker never sets the traffic light: Qubi's audit judges its files, and an override it set (green on
// its own risky file, or on someone else's) would hide what the fixed checks found.
// The lab's bench is the person's (and the chat agent's): a worker does not change it either.
const LAB_WRITE_TOOLS = lab.LAB_WRITE_TOOLS.map((n) => `platanus_${n}`);
const WORKER_REFUSED = ['platanus_set_file_score', 'platanus_run_command', ...LAB_WRITE_TOOLS];
function createMcpHandler({ handlers, onCall: report = () => {}, readOnly = false, scope = null, context: given = {} }) {
  const tools = readOnly ? TOOLS.filter((t) => READ_ONLY_TOOLS.includes(t.name))
    : scope ? TOOLS.filter((t) => !WORKER_REFUSED.includes(t.name)) : TOOLS;
  const context = Object.freeze({ ...given }); // shared by every call of this address: nobody may change it
  const onCall = context.worker ? (c) => report({ ...c, worker: context.worker }) : report;
  async function callTool(name, args) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw { code: -32602, message: `Unknown tool: ${name}` };
    if (!tools.includes(tool) && scope && !readOnly) {
      onCall({ tool: name, args, ok: false, error: 'worker' });
      return text(name === 'platanus_run_command'
        ? 'Refused: a worker of the team does not run commands. Write your files; Qubi runs what is needed when the team finishes.'
        : LAB_WRITE_TOOLS.includes(name)
          ? 'Refused: a worker does not change the lab bench. Write your files; the chat agent builds the circuit.'
          : 'Refused: a worker does not set the traffic light. Qubi audits your files when you finish.', true);
    }
    if (!tools.includes(tool)) {
      onCall({ tool: name, args, ok: false, error: 'read-only' });
      return text('Refused: this run is read-only (project tour). Explain, do not change anything.', true);
    }
    for (const key of tool.inputSchema.required ?? []) {
      if (typeof args?.[key] !== 'string') return text(`Missing "${key}".`, true);
    }
    if (['platanus_read_file', 'platanus_write_file', 'platanus_delete_file'].includes(name) && isBlockedPath(args.path)) {
      onCall({ tool: name, args, ok: false, error: 'blocked' });
      return text('Refused: this file can contain secrets and is never shared with agents.', true);
    }
    if ((name === 'platanus_write_file' || name === 'platanus_delete_file') && scope && !(await isInScope(args.path, scope))) {
      onCall({ tool: name, args, ok: false, error: 'outside-scope' });
      return text(OUTSIDE_SCOPE(scope.folders), true);
    }
    if (name === 'platanus_set_file_score' && !['green', 'yellow', 'red'].includes(args.level)) {
      return text('level must be green, yellow or red.', true);
    }
    try {
      const result = await handlers[name](args ?? {}, context);
      onCall({ tool: name, args, ok: true });
      return text(result);
    } catch (err) {
      onCall({ tool: name, args, ok: false, error: err.message });
      return text(err.message, true);
    }
  }

  async function handle(msg) {
    switch (msg.method) {
      case 'initialize':
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'platanus', version: '0.1.0' },
          instructions:
            'Qubbot shows a project as an isometric map with a security traffic light per file. Explain risks in plain Spanish for non-developers.',
        };
      case 'ping':
        return {};
      case 'tools/list':
        return { tools };
      case 'tools/call':
        return callTool(String(msg.params?.name ?? ''), msg.params?.arguments ?? {});
      default:
        throw { code: -32601, message: `Method not found: ${msg.method}` };
    }
  }

  // JSON-RPC message or batch -> reply (null for notifications only)
  return async function respond(body) {
    const batch = Array.isArray(body) ? body : [body];
    const replies = [];
    for (const m of batch) {
      if (m?.id === undefined || m?.id === null) continue; // notifications
      try {
        replies.push({ jsonrpc: '2.0', id: m.id, result: await handle(m) });
      } catch (e) {
        replies.push({ jsonrpc: '2.0', id: m.id, error: { code: e.code ?? -32603, message: e.message ?? 'Internal error' } });
      }
    }
    if (!replies.length) return null;
    return Array.isArray(body) ? replies : replies[0];
  };
}

// Only local, non-browser clients: the Host must be 127.0.0.1/localhost (DNS rebinding) and there
// must be no Origin header (browsers always send one on cross-origin requests).
function isAllowedRequest(req, port) {
  const host = String(req.headers.host ?? '');
  const okHost = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  return okHost && !req.headers.origin;
}

// `token`: private key in the address (/mcp/<token>), so other programs or users on this computer
// cannot use the server. Compared in constant time. /mcp/<token>/ro is the same server, read-only.
// /mcp/<token>/w/<workerId> is a worker's address: it exists only while scopeFor(workerId) returns
// { folders, root? } (main registers it for the run), and its writes stay inside those folders.
// The returned server has workerUrl(workerId) -> that address.
function startMcpServer({ port = 7811, handlers, onCall, token, scopeFor = () => null }) {
  const full = createMcpHandler({ handlers, onCall });
  const readOnly = createMcpHandler({ handlers, onCall, readOnly: true });
  const same = (url, path) => {
    const got = Buffer.from(String(url));
    const expected = Buffer.from(path);
    return Boolean(token) && got.length === expected.length && crypto.timingSafeEqual(got, expected);
  };
  // A worker's handler, built per request with its current scope; null when the address is not ours
  const workerPrefix = `/mcp/${token ?? ''}/w/`;
  const workerHandler = (url) => {
    const u = String(url);
    if (u.length <= workerPrefix.length || !same(u.slice(0, workerPrefix.length), workerPrefix)) return null;
    const worker = u.slice(workerPrefix.length);
    if (!WORKER_ID.test(worker)) return null;
    let scope = null;
    try { scope = scopeFor(worker); } catch { scope = null; }
    if (!scope || !Array.isArray(scope.folders) || !scope.folders.length) return null;
    return createMcpHandler({ handlers, onCall, scope, context: { worker } });
  };
  // the handler for this address, or null when it is not ours
  const handlerFor = (url) => (same(url, `/mcp/${token ?? ''}`) ? full : same(url, `/mcp/${token ?? ''}/ro`) ? readOnly : workerHandler(url));
  const server = http.createServer((req, res) => {
    const actualPort = server.address()?.port;
    if (!isAllowedRequest(req, actualPort)) {
      res.writeHead(403).end();
      return;
    }
    const respond = handlerFor(req.url);
    if (!respond) return void res.writeHead(404).end();
    if (req.method === 'GET') return void res.writeHead(405, { Allow: 'POST' }).end(); // no server stream
    if (req.method !== 'POST') return void res.writeHead(405).end();

    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return void res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      }
      const reply = await respond(body);
      if (!reply) return void res.writeHead(202).end();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });

  server.workerUrl = (worker) => `http://127.0.0.1:${server.address()?.port}/mcp/${token}/w/${worker}`;

  return new Promise((resolve) => {
    // If the port is taken (another Qubbot window, another app), let the OS pick a free one
    server.once('error', () => server.listen(0, '127.0.0.1', () => resolve(server)));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { TOOLS, createMcpHandler, startMcpServer, isBlockedPath, isBlockedRealPath, isInScope, isAllowedRequest, MAX_READ_BYTES, WORKER_ID };
