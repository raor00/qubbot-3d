// IDE shell state: which side view is active, which panels are visible, and the data the sidebar
// shows (folders and files with their security level). No DOM, no three.js.
import { Observable } from '../core/observable.js';
import { strings } from '../i18n/es.js';
import { allFiles, baseName } from '../models/fileTree.js';
import { LEVEL_RANK, worstLevel } from '../models/securityModel.js';
import { fileTags, folderGuide } from '../models/folderTags.js';

export const STAGES = ['lab', 'map', 'git'];

// 'supabase' has no dock button: it opens with a click on the Supabase node of the map
// 'catalog': the lab's parts to drag onto the bench (where the explorer was; the explorer stays next to it)
export const SIDE_VIEWS = ['catalog', 'explorer', 'risks', 'repairs', 'servers', 'agent', 'supabase'];

export class ShellViewModel {
  #projectModel;
  #securityModel;
  #mapViewModel;
  #session = -1;

  store = new Observable({
    side: 'catalog',
    stage: 'lab', // 'lab' | 'map' | 'git'
    sidebarOpen: false, // the map comes first: the side panel floats over it and starts folded
    chatOpen: false, // the chat waits for the person: opening a project does not open it
    projectName: '',
    open: false,
    folders: [], // [{ path, name, files: [{ path, name, level }] }]
    risks: [], // files in red or yellow, worst first
    counts: { green: 0, yellow: 0, red: 0, grey: 0 },
    tree: [], // full folder tree for "técnico": [{ path, name, type, level, tags?, files?, children? }]
    guide: [], // "vibe" guide and project map: [{ path, name, folder, summary, tags, files, size, red, yellow, depth }]
    recent: [], // [{ root, name, at }]
  });

  // `compact`: small screens start with the map alone; panels open on demand
  constructor({ projectModel, securityModel, mapViewModel, compact = false }) {
    if (compact) this.store.set({ sidebarOpen: false, chatOpen: false });
    this.#projectModel = projectModel;
    this.#securityModel = securityModel;
    this.#mapViewModel = mapViewModel;
    projectModel.store.subscribe(() => this.#recompute());
    securityModel.store.subscribe(() => this.#recompute());
    this.#recompute();
  }

  // Opens a side view without toggling it closed (a click on the map, not on the dock)
  showSide(side) {
    if (SIDE_VIEWS.includes(side)) this.store.set({ side, sidebarOpen: true });
  }

  setSide(side) {
    if (!SIDE_VIEWS.includes(side)) return;
    const { side: current, sidebarOpen } = this.store.state;
    // Clicking the active view again collapses the sidebar, like VS Code
    this.store.set(current === side && sidebarOpen ? { sidebarOpen: false } : { side, sidebarOpen: true });
  }

  setStage(stage) {
    if (STAGES.includes(stage)) this.store.set({ stage });
  }

  toggleSidebar() {
    this.store.set({ sidebarOpen: !this.store.state.sidebarOpen });
  }

  toggleChat() {
    this.store.set({ chatOpen: !this.store.state.chatOpen });
  }

  openProject() {
    this.#mapViewModel.openProject();
  }

  newProject() {
    this.#mapViewModel.createProject();
  }

  closeProject() {
    this.#mapViewModel.closeProject();
  }

  async refreshRecent() {
    this.store.set({ recent: await this.#projectModel.recent() });
  }

  openRecent(root) {
    return this.#projectModel.openRecent(root);
  }

  // Shows a folder's level on the map ('' = the project root)
  showFolder(path) {
    this.store.set({ stage: 'map' }); // the folder is on the map, so show it
    this.#mapViewModel.enterFolder(path || ''); // walk the map into that folder (root when empty)
  }

  // A file lives in the building of its folder
  showFile(path) {
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    this.showFolder(folder);
  }

  #recompute() {
    const { open, name, tree, session } = this.#projectModel.store.state;
    const counts = { green: 0, yellow: 0, red: 0, grey: 0 };
    const withLevel = (node) => {
      const { level, reason, reasonKey, by, findings = [] } = this.#securityModel.scoreOf(node.path);
      counts[level] += 1;
      return { path: node.path, name: baseName(node.path), level, reason, reasonKey, by, findings };
    };
    const rootFiles = tree.filter((n) => n.type === 'file').map(withLevel);
    const folders = tree
      .filter((n) => n.type === 'dir')
      .map((dir) => ({ path: dir.path, name: baseName(dir.path), files: allFiles(dir.children ?? []).map(withLevel) }));
    if (rootFiles.length) folders.unshift({ path: '', name: '', files: rootFiles });
    const risks = folders
      .flatMap((f) => f.files)
      .filter((f) => f.level === 'red' || f.level === 'yellow')
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
    // Full tree (técnico) and the guide of folders two levels deep (vibe + project map)
    const describeTree = (nodes) => nodes
      .map((n) => {
        if (n.type !== 'dir') {
          const { level, reason, reasonKey, by } = this.#securityModel.scoreOf(n.path);
          return { path: n.path, name: baseName(n.path), type: 'file', level, reason, reasonKey, by, size: n.size ?? 0, tags: fileTags(n.path) };
        }
        const children = describeTree(n.children ?? []);
        const levels = allFiles(n.children ?? []).map((f) => this.#securityModel.scoreOf(f.path).level);
        return { path: n.path, name: baseName(n.path), type: 'dir', level: worstLevel(levels), files: levels.length, children };
      })
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    const guide = [];
    const addGuide = (node, depth) => {
      const files = allFiles(node.children ?? []);
      if (!files.length) return;
      const levels = files.map((f) => this.#securityModel.scoreOf(f.path).level);
      const kind = folderGuide(node.path, files);
      const g = { tags: kind.tags, ...strings.describeFolder(kind, baseName(node.path)) };
      guide.push({
        path: node.path, folder: baseName(node.path), ...g, depth,
        files: files.length, size: files.reduce((sum, f) => sum + (f.size ?? 0), 0),
        red: levels.filter((l) => l === 'red').length, yellow: levels.filter((l) => l === 'yellow').length,
      });
      if (depth === 0) (node.children ?? []).filter((c) => c.type === 'dir').forEach((c) => addGuide(c, 1));
    };
    tree.filter((n) => n.type === 'dir').forEach((n) => addGuide(n, 0));
    this.store.set({ open, projectName: name ?? '', folders, risks, counts, tree: describeTree(tree), guide });
    if (session !== this.#session) { this.#session = session; this.refreshRecent(); }
  }
}
