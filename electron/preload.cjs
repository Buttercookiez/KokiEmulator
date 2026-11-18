const { contextBridge, ipcRenderer } = require('electron');
const beforeCloseHandlers = new Set();

ipcRenderer.on('koki:before-close', async (_event, token) => {
  try {
    for (const handler of [...beforeCloseHandlers]) await handler();
    ipcRenderer.send('koki:close-ready', { token });
  } catch (error) {
    ipcRenderer.send('koki:close-ready', { token, error: error instanceof Error ? error.message : String(error) });
  }
});

function bytes(value) {
  if (!(value instanceof Uint8Array)) throw new TypeError('Expected Uint8Array.');
  return value;
}

contextBridge.exposeInMainWorld('kokiNative', Object.freeze({
  read: async (relative) => {
    const result = await ipcRenderer.invoke('koki:read', relative);
    return result === null ? null : new Uint8Array(result);
  },
  write: (relative, value) => ipcRenderer.invoke('koki:write', relative, bytes(value)),
  remove: (relative) => ipcRenderer.invoke('koki:remove', relative),
  revealDataDirectory: () => ipcRenderer.invoke('koki:reveal-library'),
  exportFile: (name, value) => ipcRenderer.invoke('koki:export', name, bytes(value)),
  onBeforeClose: (handler) => {
    if (typeof handler !== 'function') throw new TypeError('Expected an async save handler.');
    beforeCloseHandlers.add(handler);
    return () => beforeCloseHandlers.delete(handler);
  },
}));

if (process.argv.includes('--koki-psp')) {
  contextBridge.exposeInMainWorld('kokiPsp', Object.freeze({
    games: () => ipcRenderer.invoke('koki:psp:games'),
    choose: () => ipcRenderer.invoke('koki:psp:choose'),
    favorite: id => ipcRenderer.invoke('koki:psp:favorite', id),
    remove: id => ipcRenderer.invoke('koki:psp:remove', id),
    saves: () => ipcRenderer.invoke('koki:psp:saves'),
    start: id => ipcRenderer.invoke('koki:psp:start', id),
    frame: async (buttons, x, y) => new Uint8Array(await ipcRenderer.invoke('koki:psp:frame', buttons, x, y)),
    checkpoint: (restore, id) => ipcRenderer.invoke('koki:psp:checkpoint', restore, id),
    checkpoints: () => ipcRenderer.invoke('koki:psp:checkpoints'),
    deleteCheckpoint: id => ipcRenderer.invoke('koki:psp:delete-checkpoint', id),
    screenshot: data => ipcRenderer.invoke('koki:psp:screenshot', data),
    stop: () => ipcRenderer.invoke('koki:psp:stop'),
  }));
}
