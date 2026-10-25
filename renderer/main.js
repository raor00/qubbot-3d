// Composition root: creates Models -> ViewModels -> Views and wires them together.
// Models know nothing about the screen; ViewModels hold screen state and actions (no DOM, no three.js);
// Views only draw and forward user input to ViewModels.
import { findNode } from './models/fileTree.js';
import { createEventBus, EVENTS } from './core/eventBus.js';
import { strings } from './i18n/es.js';
import { createWorkspaceService } from './services/workspaceService.js';
import { createAgentService } from './services/agentService.js';
import { connectMcpBridge } from './services/mcpBridge.js';
import { createServerService } from './services/serverService.js';
import { ServersModel } from './models/serversModel.js';
import { ServersViewModel } from './viewmodels/serversViewModel.js';
import { createGitService } from './services/gitService.js';
import { createHandTrackingService } from './services/handTrackingService.js';
import { createVoiceService } from './services/voiceService.js';
import { createRunService } from './services/runService.js';
import { createSecurityService } from './services/securityService.js';
import { openSession, openSimulatedSession } from './models/callSession.js';
import { createProjectMemory, memoryText } from './models/projectMemoryModel.js';
import { createFaceTrackingService } from './services/faceTrackingService.js';

import { ProjectModel } from './models/projectModel.js';
import { SetupModel } from './models/setupModel.js';
import { TrustModel } from './models/trustModel.js';
import { createIntegrationService } from './services/integrationService.js';
import { ConnectViewModel } from './viewmodels/connectViewModel.js';
import { DatabaseViewModel } from './viewmodels/databaseViewModel.js';
import { createConnectModalView } from './views/ui/connectModalView.js';
import { SecurityModel } from './models/securityModel.js';
import { SupabaseModel } from './models/supabaseModel.js';
import { AgentModel } from './models/agentModel.js';
import { GitModel } from './models/gitModel.js';
import { AgentConnectionModel } from './models/agentConnectionModel.js';
import { ModeModel } from './models/modeModel.js';
import { RepairHistoryModel } from './models/repairHistoryModel.js';

import { CameraViewModel } from './viewmodels/cameraViewModel.js';
import { SupabaseViewModel } from './viewmodels/supabaseViewModel.js';
import { MapViewModel } from './viewmodels/mapViewModel.js';
import { ApprovalModel } from './models/approvalModel.js';
import { ComposerViewModel } from './viewmodels/composerViewModel.js';
import { ChatViewModel } from './viewmodels/chatViewModel.js';
import { GitViewModel } from './viewmodels/gitViewModel.js';
import { AppViewModel } from './viewmodels/appViewModel.js';
import { ShellViewModel } from './viewmodels/shellViewModel.js';
import { RepairViewModel } from './viewmodels/repairViewModel.js';
import { AuditViewModel } from './viewmodels/auditViewModel.js';
import { TourViewModel } from './viewmodels/tourViewModel.js';
import { RobotViewModel } from './viewmodels/robotViewModel.js';
import { BuildViewModel } from './viewmodels/buildViewModel.js';
import { HandControlViewModel } from './viewmodels/handControlViewModel.js';
import { HandsFreeViewModel } from './viewmodels/handsFreeViewModel.js';
import { HandsFreeSettings } from './models/handsFreeSettings.js';
import { EditorViewModel } from './viewmodels/editorViewModel.js';
import { CallViewModel } from './viewmodels/callViewModel.js';
import { TeamViewModel } from './viewmodels/teamViewModel.js';
import { ServicesViewModel } from './viewmodels/servicesViewModel.js';

import { createSceneView } from './views/scene/sceneView.js';
import { createMapView } from './views/scene/mapView.js';
import { createSupabaseView } from './views/scene/supabaseView.js';
import { createInputController } from './views/scene/inputController.js';
import { createGitView } from './views/scene/gitView.js';
import { createRobotView } from './views/scene/robotView.js';
import { createTourView } from './views/scene/tourView.js';
import { createBuildSiteView } from './views/scene/buildSiteView.js';
import { createTeamView } from './views/scene/teamView.js';
import { createDemoCursor } from './views/ui/demoCursorView.js';
import { isDemo } from './core/demoMode.js';
import { RobotDialogViewModel } from './viewmodels/robotDialogViewModel.js';
import { createWelcomeRobotView } from './views/scene/welcomeRobotView.js';
import { createHudView } from './views/ui/hudView.js';
import { createLabelLayer } from './views/ui/labelLayer.js';
import { createControlsView } from './views/ui/controlsView.js';
import { createHandControlView } from './views/ui/handControlView.js';
import { createHandCursorView, createHandTargets } from './views/ui/handCursorView.js';
import { createHandsFreeView } from './views/ui/handsFreeView.js';
import { createPanelsView } from './views/ui/panelsView.js';
import { createChatView } from './views/ui/chatView.js';
import { createShellView } from './views/ui/shellView.js';
import { createAgentConnectView } from './views/ui/agentConnectView.js';
import { createAgentPickerView } from './views/ui/agentPickerView.js';
import { attachMenu } from './views/ui/chatMenuView.js';
import { chatMenuItems } from './viewmodels/chatMenu.js';
import { createIconBarView } from './views/ui/iconBarView.js';
import { createChatDockView } from './views/ui/chatDockView.js';
import { createCallBarView } from './views/ui/callBarView.js';
import { createVoiceConnectView } from './views/ui/voiceConnectView.js';
import { createServiceConnectView } from './views/ui/serviceConnectView.js';
import { createRepairPanelView } from './views/ui/repairPanelView.js';
import { createHoverCardView } from './views/ui/hoverCardView.js';
import { createEditorView } from './views/ui/editorView.js';
import { qubiJump } from './views/ui/qubiJump.js';
import { applyStrings } from './views/ui/domStrings.js';
import { applyIcons } from './views/icons.js';

// --- Models ---
const bus = createEventBus();
const workspace = createWorkspaceService();
// What the welcome robot set up in a new project and still waits for the person's account ("Por conectar")
const setupModel = new SetupModel();
const projectModel = new ProjectModel(workspace, { setup: setupModel });
// Trusted folder (like VS Code): asked each time a project opens; trusted, the agent saves without asking each time
const trustModel = new TrustModel({ workspace, projectModel });
const securityModel = new SecurityModel();
// The security audit (electron/securityAudit.js): it decides the lights of the map and the score
const auditViewModel = new AuditViewModel({ securityModel, service: createSecurityService(), bus });
const supabaseModel = new SupabaseModel();
const gitModel = new GitModel(workspace);
const agentService = createAgentService();
const connection = new AgentConnectionModel(agentService);
const modeModel = new ModeModel();
const repairHistory = new RepairHistoryModel();
const serversModel = new ServersModel(createServerService());
const gitService = createGitService();
const agentModel = new AgentModel({ workspace, projectModel, supabaseModel, connection, modeModel, gitService });

// Reload git history automatically after every write operation (commit, revert, reset, checkout...)
if (gitService.onChanged) {
  gitService.onChanged(() => gitModel.scheduleReload());
}

// --- ViewModels ---
const cameraViewModel = new CameraViewModel();
// the example tables and the RLS alert are the web demo's only (the desktop invents nothing)
const supabaseViewModel = new SupabaseViewModel({ supabaseModel, projectModel, camera: cameraViewModel, bus, demo: !workspace.isDesktop });
const mapViewModel = new MapViewModel({ projectModel, securityModel, camera: cameraViewModel, supabaseViewModel, bus });
const gitViewModel = new GitViewModel({ gitModel, camera: cameraViewModel, bus });
const appViewModel = new AppViewModel({ camera: cameraViewModel, gitModel, gitViewModel });
const shellViewModel = new ShellViewModel({ projectModel, securityModel, mapViewModel, compact: window.matchMedia('(max-width: 820px)').matches });
const repairViewModel = new RepairViewModel({ securityModel, mapViewModel, cameraViewModel, connection, history: repairHistory, agentService, bus, voiceMode: () => (modeModel.tech ? 'dev' : 'vibe'), audit: auditViewModel });
const serversViewModel = new ServersViewModel({ serversModel });
const editorViewModel = new EditorViewModel({ workspace, bus }); // files clicked on the map open as tabs
const handTracking = createHandTrackingService();
// The tour of the open project ("Recorrido"): the analyzer decides the stops, the agent narrates them
const tourViewModel = new TourViewModel({ projectModel, workspace, connection, modeModel, camera: cameraViewModel, mapViewModel, repairViewModel, bus });
// The hand's screen side (what is under the cursor, selecting it, zooming around a point) is filled in
// below, once the 3D views and the input controller exist (spec/003-hand-gestures.md)
const handActions = {};
const handControlViewModel = new HandControlViewModel({ tracking: handTracking, camera: cameraViewModel, actions: handActions });
// Using Platanus without hands, with the eyes or the head (spec/004-hands-free-control.md): same screen side
const faceTracking = createFaceTrackingService();
const handsFreeSettings = new HandsFreeSettings();
const handsFreeActions = { stopHands: () => { if (handControlViewModel.on) handControlViewModel.stop(); } };
const handsFreeViewModel = new HandsFreeViewModel({ tracking: faceTracking, settings: handsFreeSettings, actions: handsFreeActions });
// One input at a time (B5): turning the hands on pauses the hands-free control (it comes back on next launch)
handControlViewModel.store.subscribe(({ status }) => { if (status === 'starting' && handsFreeViewModel.on) handsFreeViewModel.stop(); });
// The server list only refreshes while its side view is on screen
shellViewModel.store.subscribe(({ side, sidebarOpen }) => serversViewModel.setVisible(sidebarOpen && side === 'servers'), { immediate: true });

// App actions shared by the chat, the menus and the sidebar
const stage = document.getElementById('stage');
const actions = {
  // Qubi hops from the button to the map, then walks to the file's folder
  repair(path, from = null) {
    tourViewModel.exit({ restore: false }); // Qubi takes the map
    shellViewModel.setStage('map');
    if (repairViewModel.busy || !from) return repairViewModel.start(path);
    qubiJump(from, stage).then(() => repairViewModel.start(path));
  },
  repairWorst(from = null) {
    const worst = shellViewModel.store.state.risks.find((f) => f.level === 'red' || f.by !== 'qubi');
    if (!worst) return chatViewModel.sayFromMap({ text: strings.repair.nothing });
    actions.repair(worst.path, from);
  },
  showRisks: () => shellViewModel.store.state.side === 'risks' && shellViewModel.store.state.sidebarOpen || shellViewModel.setSide('risks'),
  // Send a file to the chat so the agent checks whether its risk is real
  audit(path, reason) {
    if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
    if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
    chatViewModel.send(strings.chat.auditPrompt(path, reason));
  },
  // A file or folder named by the agent (links and "Ver … en el mapa" chips)
  // Opening files from the chat (chatViewModel.openFile)
  // The tree is loaded level by level: what it does not hold yet is asked to the disk
  entryOf: async (path) => (path ? findNode(projectModel.store.state.tree, path) : null)
    ?? (await workspace.kind(path).then((r) => (r.ok && r.data ? { path, type: r.data } : null))),
  fileInfo: (path) => securityModel.scoreOf(path),
  readFile: (path) => workspace.read(path),
  openFile: (path, how) => workspace.open(path, how),
  locate(path) {
    shellViewModel.setStage('map');
    if (!mapViewModel.show(path)) chatViewModel.sayFromMap({ text: strings.chat.notInProject(path) });
  },
  async startTour() {
    shellViewModel.setStage('map');
    if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
    const result = await tourViewModel.start();
    if (result.reason === 'busy') chatViewModel.sayFromMap({ text: strings.tour.busy });
  },
  // Starts a message in the chat box (the person finishes it)
  draft(text) {
    if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
    if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
    composerViewModel.setDraft(text);
    requestAnimationFrame(() => {
      const box = document.getElementById('chat-text');
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    });
  },
  tourNext: () => tourViewModel.next(),
  tourPrev: () => tourViewModel.prev(),
  tourExit: () => tourViewModel.exit(),
  showConnect: () => (shellViewModel.store.state.side === 'agent' && shellViewModel.store.state.sidebarOpen) || shellViewModel.setSide('agent'),
  showRepairs: () => (shellViewModel.store.state.side === 'repairs' && shellViewModel.store.state.sidebarOpen) || shellViewModel.setSide('repairs'),
  openChat() {
    if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
    if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
  },
  // The welcome robot hands a ready-made request to the agent (scaffold, .gitignore, README). With no agent
  // connected (none logged in, so none picked automatically) the scripted demo would answer, so the request
  // waits until the person picks one
  // Returns true when an agent got the request now, false when it waits for one
  askAgent(prompt) {
    actions.openChat();
    if (connection.live) {
      chatViewModel.send(prompt);
      return true;
    }
    pendingAgentPrompt = prompt;
    actions.showConnect();
    chatViewModel.sayFromMap({ text: strings.map.welcome.pickAgent });
    return false;
  },
  // The robot's "save my progress": a commit understood by the chat itself (git asks before writing)
  saveProgress() {
    actions.openChat();
    chatViewModel.send(strings.map.welcome.saveProgressPhrase);
  },
  trustFolder: () => trustModel.ask(),
  // The Supabase panel's "Ver tablas en el mapa": the 3D schema next to the node
  openSchema: () => { if (!supabaseViewModel.store.state.schemaOpen) mapViewModel.toggleSchema(); },
  untrustFolder: () => trustModel.revoke(),
  // Someone who already programs: the app talks in Dev mode
  devMode: () => modeModel.set('tech'),
  // The integrations the welcome robot is setting up: "Por conectar" on the map once their files arrive
  prepareSetup(integrations) {
    setupModel.prepare(projectModel.store.state.root, integrations);
    projectModel.reload();
  },
};
// "Conectar mi cuenta": Supabase connects from its modal (Platanus signs in and writes the keys, not the agent)
const integrationService = createIntegrationService();
const connectViewModel = new ConnectViewModel({
  service: integrationService,
  onConnected: (key, result) => {
    const S = strings.accounts.supabase;
    setupModel.markConnected(projectModel.store.state.root, key);
    setupModel.link(projectModel.store.state.root, key, { projectId: result.projectId, name: result.name }); // the panel reads its numbers
    if (shellViewModel.store.state.side === 'supabase') databaseViewModel.load();
    securityModel.setScore(result.envFile, 'green', S.envReason); // Platanus wrote it and .gitignore keeps it out
    projectModel.reload();
    actions.openChat();
    chatViewModel.sayFromMap({ text: S.chat(result.name) });
  },
});
// The Supabase side panel: the connection and the database's numbers
const databaseViewModel = new DatabaseViewModel({
  service: integrationService, projectModel, setupModel, supabaseModel, onConnect: () => connectViewModel.open('supabase'),
});
// A click on an integration of the map: a connected Supabase opens its panel; one still waiting for the
// person's account opens "Conectar mi cuenta" (Supabase) or explains what is missing (the others, for now)
bus.on(EVENTS.integrationPicked, ({ key, status }) => {
  if (key === 'supabase' && status !== 'pending') {
    shellViewModel.showSide('supabase');
    return databaseViewModel.load();
  }
  if (status !== 'pending') return;
  if (key === 'supabase') return connectViewModel.open('supabase');
  actions.openChat();
  chatViewModel.sayFromMap({ text: strings.integrations.pendingInfo(strings.integrations.names[key] ?? key) });
});
let pendingAgentPrompt = null;
connection.store.subscribe(() => {
  if (!connection.live || !pendingAgentPrompt) return;
  const prompt = pendingAgentPrompt;
  pendingAgentPrompt = null;
  chatViewModel.send(prompt);
});
const chatViewModel = new ChatViewModel({ agentModel, bus, actions, connection, isTech: () => modeModel.tech });
// The welcome robot interviews the person on a new project (Desire's dialog, welcomeRobotView.js)
const robotDialogViewModel = new RobotDialogViewModel({ mapViewModel, projectModel, securityModel, actions });
// Building live: the robot carries each file an agent saves to its folder (it reads the chat's run cards)
const buildViewModel = new BuildViewModel({ chatViewModel, mapViewModel, projectModel, tourViewModel, camera: cameraViewModel, bus });
// The robot companion: drag or throw it onto a folder and it asks what to do there
const robotViewModel = new RobotViewModel({ projectModel, mapViewModel, tourViewModel, buildViewModel, bus });
// The services the project uses (Supabase, Stripe…) and whether the agent can work with them: one chat
// card per project and session and a short line from the robot when something is offline (after the
// chat's own greeting of the project, so the card lands below it)
const servicesViewModel = new ServicesViewModel({
  projectModel, bus, chat: chatViewModel, connection,
  say: (text, choices) => robotViewModel.say(text, choices),
});
// What Qubi remembers of each project between calls (fase 3, docs/features/llamada/FASE2.md): main keeps
// it on disk, keyed by the project's full path (the web version keeps it in this window). The workers'
// prompts need it as text right away, so the open project's memory is kept here, read when it opens and
// again each time the call saves to it.
const projectMemoryStore = createProjectMemory();
const memoryKey = (state) => (state.open ? String(state.root ?? state.name ?? '') || null : null); // as callViewModel
let remembered = { key: null, text: '' };
const remember = (key, memory) => {
  if (key && key === memoryKey(projectModel.store.state)) remembered = { key, text: memoryText(memory) };
  return memory;
};
const projectMemory = {
  ...projectMemoryStore,
  read: (root) => projectMemoryStore.read(root).then((m) => remember(root, m)),
  append: (root, entry) => projectMemoryStore.append(root, entry).then((m) => remember(root, m)),
  learn: (root, facts) => projectMemoryStore.learn(root, facts).then((m) => remember(root, m)),
};
// An empty memory says nothing to a worker (its prompt leaves the section out)
const memoryNow = () => (remembered.key && remembered.key === memoryKey(projectModel.store.state) && remembered.text !== strings.memory.empty ? remembered.text : '');
// Qubi's team (fase 2): 2 or 3 workers, each one a run of the chat's agent writing only in its folder;
// Qubi audits each one (the fixed checks decide). It cancels itself on the tour and on a closed or new project.
const teamViewModel = new TeamViewModel({ connection, projectModel, mapViewModel, securityModel, memory: memoryNow, bus });
// The call with Qubi (docs/features/llamada/README.md, MEJORAS.md, VOZ.md): Qubi talks over ElevenLabs or
// Grok Voice, the agent picked in the chat builds (or hands the work out to the team). Simulated only in
// the web version (no voice bridge) or when the person picks it: with no voice service connected the call
// ends in error 'offline' and the voice-connect modal opens (voiceConnectView). The voice service is
// shared with that modal (sign in, paste a key).
const voiceService = createVoiceService();
// ejecutar_app: main runs the project's own dev/start script after its native confirm; it only answers the
// port, so the preview opens here. Those ports count as the project's servers for abrir_en_navegador
const startedPorts = new Set();
const runService = (() => {
  const run = createRunService();
  return {
    ...run,
    async start(id) {
      const res = await run.start(id);
      if (res?.ok && Number.isInteger(res.port)) {
        startedPorts.add(res.port);
        serversModel.open(res.port);
      }
      return res;
    },
  };
})();
const callViewModel = new CallViewModel({
  voiceService, runService, openSession, openSimulatedSession, chatViewModel, projectModel, mapViewModel, securityModel, connection, bus,
  teamViewModel, memory: projectMemory,
  actions: {
    // mostrar_carpeta and ir_a: only visual, the map flies to the folder (the project root goes back home)
    showFolder: (path) => { shellViewModel.setStage('map'); return path ? mapViewModel.show(path) : (mapViewModel.home(), true); },
    // abrir_archivo (after the person's permission): the floating editor, as a click on the map
    openFile: (path) => editorViewModel.open(path),
    // abrir_en_navegador: servers Qubbot started (managed) or Qubi started in this window. The server
    // list knows no projects, so any other port (a database, another app) is never offered
    async projectServers() {
      if (serversModel.store.state.demo) return [];
      await serversModel.refresh();
      return serversModel.store.state.servers.filter((s) => s.managed || startedPorts.has(s.port)).map((s) => ({ port: s.port }));
    },
    openPreview: (port) => serversModel.open(port),
    // auditar: the whole project again -> { before, after, fixed, worse } (null when it could not run)
    audit: async () => ((await auditViewModel.auditNow()) ? auditViewModel.store.state.last : null),
    // reparar (after the person's yes): the same repair as the risks panel's button
    repair: (path) => actions.repair(path),
    // ajustar_qubi: «modo dev» / «modo vibe» (the technical level) switches the app too
    setMode: (mode) => modeModel.set(mode),
  },
  simulate: false,
});
// …and the other way: Vibe / Dev in the app sets Qubi's technical level
modeModel.store.subscribe(({ mode }) => callViewModel.syncMode(mode === 'tech'), { immediate: true });
// The Simulator agent (PLATANUS_SIM=1) no longer turns the simulated call on by itself: the person saw
// «Llamada simulada» when they wanted to talk to Qubi. Practice calls are chosen in the call's settings
// or with «Probar sin voz» in the voice-connect modal
// The team's card in the chat, updated in place while it works. Only phase and workers matter (not Qubi's
// guide or the sheets); a team cancelled mid-work goes idle with no workers, so its card is closed with
// the last rows it had (the "idle" that follows a finished team adds nothing: upsertTeamCard)
let lastTeam = [];
teamViewModel.store.subscribe(({ phase, workers }, previous) => {
  if (previous && phase === previous.phase && workers === previous.workers) return;
  if (workers.length) lastTeam = workers;
  else if (phase !== 'idle') return;
  chatViewModel.upsertTeamCard({ phase, workers: workers.length ? workers : lastTeam });
  if (phase === 'idle') lastTeam = [];
});
// The agent waits for the person to approve a change (main process dialog): the chat says so
agentService.onAwaiting((detail) => bus.emit(EVENTS.agentAwaiting, detail));
agentService.onChanged((change) => bus.emit(EVENTS.agentChanged, change)); // its diff, live in the chat

// The stage tab drives which 3D view is on screen: the git tab shows the branches, the rest the map
shellViewModel.store.subscribe(({ stage: tab }) => appViewModel.setView(tab === 'git' ? 'git' : 'map'), { immediate: true });

// --- Views ---
applyStrings();
applyIcons(); // Hugeicons into the static <i data-icon> slots, before the views look for them
const sceneView = createSceneView(cameraViewModel, stage); // the map lives in the IDE stage
const labels = createLabelLayer(document.getElementById('map-labels'), sceneView);
// Services of the project (docs/features/servicios/README.md): a click on an integration node opens its
// connect modal; the names come from main's catalog
const mapView = createMapView({
  sceneView, labels, mapViewModel,
  nameOf: (key) => servicesViewModel.store.state.services.find((s) => s.key === key)?.name ?? null,
  onIntegration: (key) => servicesViewModel.openConnect(key),
});
const supabaseView = createSupabaseView({ sceneView, labels, supabaseViewModel, supabaseModel });
const gitView = createGitView({ sceneView, labels, gitViewModel });
// (the old repair character, qubiView.js, is no longer drawn: robotView's repair job does it)
createTourView({ sceneView, labels, tourViewModel });
const robotView = createRobotView({
  sceneView, labels, mapViewModel, tourViewModel, buildViewModel, robotViewModel, robotDialogViewModel, chatViewModel, cameraViewModel, callViewModel, teamViewModel,
  repairViewModel, tech: () => modeModel.tech, // the robot you talk to is the one that repairs
  openChat: () => {
    if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
    if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
  },
});
createBuildSiteView({ sceneView, labels, buildViewModel, hands: () => robotView.hands });
// The team's mini robots come out of Qubi, wherever he stands (pointing at one shows its task).
// The team only starts from a call, so the call panel above Qubi is his "bubble" then: the workers'
// bubbles stack against Qubi's bubble and the anchored panel together (never hidden under the panel)
const callBarEl = document.getElementById('call-bar');
const leadBox = () => {
  const boxes = [robotView.bubble(), callBarEl && !callBarEl.hidden && callBarEl.dataset.place === 'anchor' ? callBarEl : null].filter(Boolean);
  if (boxes.length < 2) return boxes[0] ?? null;
  return {
    getBoundingClientRect() {
      const rects = boxes.map((b) => b.getBoundingClientRect()).filter((r) => r.width);
      if (!rects.length) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return { left, right, top, bottom, width: right - left, height: bottom - top };
    },
  };
};
const teamView = createTeamView({ sceneView, labels, teamViewModel, origin: robotView.qubi, cameraViewModel, qubiBubble: leadBox });
createWelcomeRobotView({ sceneView, labels, mapViewModel, robotDialogViewModel, tourViewModel, buildViewModel, callViewModel, teamViewModel });
createConnectModalView({ connectViewModel });
if (isDemo) {
  createDemoCursor(); // recording the product video (scripts/demo/)
  // the recorder (and checks) can drive the robot and find 3D things on screen
  window.__platanus = {
    robotViewModel, robotDialogViewModel, tourViewModel, mapViewModel, buildViewModel, chatViewModel, cameraViewModel, projectModel, connectViewModel,
    callViewModel, teamViewModel, servicesViewModel,
    screenOf: (point) => { const r = stage.getBoundingClientRect(); const s = sceneView.toScreen(point); return { x: r.left + s.x, y: r.top + s.y }; },
  };
}
sceneView.onFrame(labels.update); // last: after every view moved its anchors
appViewModel.store.subscribe(({ view }) => {
  sceneView.setActiveLayer(view);
  labels.setActiveLayer(view);
}, { immediate: true });
createEditorView({ stage, editorViewModel });
const hoverCard = createHoverCardView({ card: document.getElementById('hover-card'), stage, mapViewModel, modeModel });

// Clicks, hover and Esc go to the view on screen
const projectOpen = () => mapViewModel.store.state.status === 'ready';
const pickers = {
  map: () => ({
    targets: [...supabaseView.pickTargets(), ...mapView.pickTargets()],
    handle: (pick) => mapView.handlePick(pick) || mapViewModel.handlePick(pick), // integration nodes first
  }),
  git: () => ({ targets: gitView.pickTargets(), handle: (pick) => gitViewModel.handlePick(pick) }),
};
const input = createInputController({
  sceneView,
  cameraViewModel,
  picker: () => (projectOpen() ? pickers[appViewModel.view]() : null),
  onEscape: () => (appViewModel.view === 'git' ? gitViewModel.escape() : mapViewModel.escape()),
  onToggleView: () => shellViewModel.setStage(appViewModel.view === 'git' ? 'map' : 'git'),
  onHover: (pick, x, y) => hoverCard.show(appViewModel.view === 'map' ? pick : null, x, y),
  // Qubi is dragged, the mini robots only pointed at; both win over the folder under them
  grabber: () => (appViewModel.view === 'map' ? [robotView.grabber, teamView.pointer] : null),
});
createControlsView({ cameraViewModel, onReset: () => (appViewModel.view === 'map' ? mapViewModel.home() : cameraViewModel.reset()) });
createHandControlView({ handControlViewModel, video: handTracking.video, dev: workspace.isDev });
// A confirmation dialog is open: the hand selects nothing meanwhile
let dialogOpen = false;
workspace.onDialog((open) => { dialogOpen = Boolean(open); });
const gestureTargets = createHandTargets({
  canvas: sceneView.canvas,
  pickAtScreen: input.pickAtScreen,
  zoomAt: input.zoomAt,
  handlePick: (pick) => (projectOpen() ? pickers[appViewModel.view]().handle(pick) : undefined),
  hover: (pick, x, y) => hoverCard.show(appViewModel.view === 'map' ? pick : null, x, y),
  dialogOpen: () => dialogOpen,
});
Object.assign(handActions, gestureTargets);
Object.assign(handsFreeActions, gestureTargets);
createHandCursorView({ handControlViewModel });
createHandsFreeView({ handsFreeViewModel, settings: handsFreeSettings, video: faceTracking.video, dev: workspace.isDev });

createPanelsView({ appViewModel, mapViewModel, supabaseViewModel, gitViewModel });
// Which agent changes ask first (Manual / Auto / Sin preguntar)
const approvalModel = new ApprovalModel(agentService);
approvalModel.init();
const composerViewModel = new ComposerViewModel({ connection, projectModel, modeModel });
createChatView({ chatViewModel, composerViewModel, connection, modeModel, callViewModel });
createHudView({ appViewModel, mapViewModel, gitViewModel, onShowRisks: () => actions.showRisks() });
createShellView({ shellViewModel, modeModel, approval: approvalModel, repairViewModel, repairHistory, serversViewModel, databaseViewModel, actions, auditViewModel, securityModel });
createRepairPanelView({ container: document.getElementById('qubi-layer'), repairViewModel, modeModel, actions });
createAgentPickerView({ container: document.getElementById('agent-picker'), connection, approval: approvalModel, onMore: actions.showConnect });
createIconBarView({ bar: document.getElementById('stage-tabs') });
createIconBarView({ bar: document.getElementById('side-dock'), vertical: true });
// The chat and the side panel stay in their place (bottom right, left edge); the chat can be pinned as a column
const workspaceEl = document.getElementById('workspace');
createChatDockView({ workspace: workspaceEl, chat: document.getElementById('chat'), pinButton: document.getElementById('chat-pin') });
// «Qubi está fuera de conexión»: opens by itself when a call ends in error 'offline', and from the call's
// settings (VOZ.md)
const voiceConnect = createVoiceConnectView({ container: document.getElementById('voice-connect'), voiceService, callViewModel });
// The call panel and the phone in the chat header. During a call the panel floats above Qubi's head and
// follows him every frame; in the git view, or when Qubi is hidden (the tour), it docks at the bottom
// center. "Chat" opens the chat at the call's card, where the person can write to Qubi
createCallBarView({
  container: document.getElementById('call-bar'), callButton: document.getElementById('chat-call'), callViewModel, connection,
  sceneView, voiceConnect,
  // while Qubi builds his bubble stays (robotView 'build' job): the panel sits above it, not on it.
  // No head (hidden, the tour): docked, even if a bubble shows
  anchor: () => {
    const head = appViewModel.view === 'map' ? robotView.head() : null;
    return head ? robotView.bubble() ?? head : null;
  },
  onOpenChat: () => {
    actions.openChat();
    requestAnimationFrame(() => {
      const id = callViewModel.store.state.cardId;
      if (id != null) document.querySelector(`#chat-body [data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
      document.getElementById('chat-text')?.focus();
    });
  },
});
// The security card stays fixed at the top right of the map (hud.css)

// Chat options: the "+" in the composer, and the floating button when the chat is minimized or closed
const $id = (id) => document.getElementById(id);
const openChat = () => {
  if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
  if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
};
// What the chat menus show, read when they open: who answers, whether it works, the worst risk, the counts
// and the repairs waiting to be checked
const menuInfo = () => {
  const c = connection.store.state;
  const agent = c.agents.find((a) => a.id === c.selected);
  const shell = shellViewModel.store.state;
  const worst = shell.risks.find((f) => f.level === 'red' || f.by !== 'qubi') ?? null;
  const last = chatViewModel.store.state.messages.at(-1);
  return {
    agent: agent ? { id: agent.id, name: agent.label.split(' (')[0] } : null,
    working: Boolean(chatViewModel.store.state.typing || last?.run?.status === 'running'),
    worst: worst && { path: worst.path, level: worst.level },
    counts: shell.counts,
    pending: repairHistory.store.state.entries.filter((e) => e.status === 'fixed' || e.status === 'planned').length,
    projectOpen: projectModel.store.state.open,
    empty: !projectModel.store.state.tree.length,
    trust: trustModel.store.state.available ? trustModel.store.state.trusted : undefined,
  };
};
attachMenu($id('chat-more'), $id('chat-more-menu'), () => chatMenuItems({ actions, modeModel, chatViewModel, info: menuInfo }));
attachMenu($id('chat-launcher-button'), $id('chat-launcher-menu'), () => chatMenuItems({ actions, modeModel, chatViewModel, openChat, info: menuInfo }));
createAgentConnectView({ container: document.getElementById('agent-connect'), connection, modeModel });
createServiceConnectView({ servicesViewModel }); // «Fuera de conexión: Stripe»
connectMcpBridge({ agentService, securityModel, shellViewModel });
connection.refresh();

// --- Wiring between layers ---
projectModel.store.subscribe((state, previous) => {
  if (state.session === previous.session) return;
  repairViewModel.reset(); // nothing from the previous project keeps running
  callViewModel.hangUp(); // the call ends with the project, closed or replaced (a no-op with no call)
  teamViewModel.cancel(); // its runs stop too (it also does it itself on the session change; a no-op when idle)
  remembered = { key: null, text: '' };
  const key = memoryKey(state);
  if (key) projectMemory.read(key); // the workers' prompts get it without waiting for a call
  if (!state.open) { // closed: back to the start screen
    auditViewModel.close();
    handControlViewModel.stop(); // the camera goes off with the project
    handsFreeViewModel.projectClosed(); // the hands-free control stays on, to pick another project (B34)
    gitModel.clear();
    bus.emit(EVENTS.projectClosed, { name: previous.name ?? strings.map.defaultProjectName });
    return;
  }
  repairHistory.load(state.name ?? strings.map.defaultProjectName); // each project keeps its own history
  auditViewModel.open(); // read the project again: its lights and score come from what the files say
  bus.emit(EVENTS.projectOpened, { name: state.name ?? strings.map.defaultProjectName });
  // Fresh git history and cameras for the new project
  appViewModel.resetCameras();
  gitModel.clear();
  gitModel.load();
  if (appViewModel.view === 'git') gitViewModel.centerOnHead();
});

// macOS: the Project menu of the system menu bar runs the same actions as the in-app one
const MENU_ACTIONS = {
  newProject: () => shellViewModel.newProject(),
  openProject: () => shellViewModel.openProject(),
  openRecent: ({ root }) => shellViewModel.openRecent(root),
  closeProject: () => shellViewModel.closeProject(),
};
workspace.onMenuAction((payload) => MENU_ACTIONS[payload?.action]?.(payload));

workspace.onChanged((paths) => {
  bus.emit(EVENTS.diskChanged, { paths });
  auditViewModel.check(paths); // what changed is audited again (a repair, an editor, a git checkout…)
  projectModel.scheduleReload();
  gitModel.scheduleReload();
});

// .git is not watched (too noisy), so commits made in a terminal show up when the window regains focus
// …and the services (a CLI login or an MCP added in a terminal), at most every 30 s: main's cache is emptied
let servicesCheckedAt = 0;
window.addEventListener('focus', () => {
  if (!projectOpen()) return;
  gitModel.scheduleReload();
  if (Date.now() - servicesCheckedAt > 30_000) { servicesCheckedAt = Date.now(); servicesViewModel.refresh(); }
});

// Public hook for the AI agent: set the traffic light of a file.
//   window.dispatchEvent(new CustomEvent('file:score', { detail: { path, level: 'red', reason } }))
window.addEventListener('file:score', (e) => {
  const { path, level, reason } = e.detail ?? {};
  securityModel.setScore(path, level, reason);
});

// If the app already had a folder open (e.g. after reloading the window), show it
projectModel.restore();
