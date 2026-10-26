// The lab's design file and its exports (electron/lab.js through the preload bridge: lab:load, lab:save,
// lab:export). Main validates and re-serializes what it saves, and writes only to fixed paths. Outside
// Electron (the web version) everything stays in memory for this window.
export const LAB_EXPORTS = Object.freeze({
  stl: 'laboratorio/caja.stl',
  scad: 'laboratorio/caja.scad',
  ino: 'laboratorio/circuito/circuito.ino',
});

export function createLabService(bridge = globalThis.window?.platanus) {
  const api = bridge?.lab;
  if (api) {
    return {
      available: true,
      load: () => api.load(),
      save: (text) => api.save(text),
      exportFile: (kind, content) => api.export(kind, content),
    };
  }
  let text = null;
  const files = new Map();
  return {
    available: false,
    load: async () => ({ ok: true, data: text }),
    save: async (next) => { text = String(next); return { ok: true }; },
    exportFile: async (kind, content) => {
      const file = Object.hasOwn(LAB_EXPORTS, kind) ? LAB_EXPORTS[kind] : null;
      if (!file) return { ok: false, error: 'kind' };
      files.set(file, content);
      return { ok: true, data: { file } };
    },
  };
}
