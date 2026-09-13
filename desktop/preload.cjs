/* oxlint-disable typescript/no-require-imports -- Electron sandboxed preload. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'wellcumNetwork',
  Object.freeze({
    host: (mode) => ipcRenderer.invoke('wellcum:network:host', mode),
    stop: () => ipcRenderer.invoke('wellcum:network:stop'),
    status: () => ipcRenderer.invoke('wellcum:network:status'),
    request: (connection, payload) =>
      ipcRenderer.invoke('wellcum:network:request', connection, payload),
    disconnect: () => ipcRenderer.invoke('wellcum:network:disconnect'),
    copy: (text) => ipcRenderer.invoke('wellcum:network:copy', text),
  }),
);
