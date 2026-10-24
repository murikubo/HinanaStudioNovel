const { contextBridge, ipcRenderer } = require('electron');
const invoke = (name, ...args) => ipcRenderer.invoke(`novel:${name}`, ...args);
const subscribe = (name, callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on(`novel:${name}`, listener); return () => ipcRenderer.removeListener(`novel:${name}`, listener); };
contextBridge.exposeInMainWorld('novel', {
  hinanaPublish: (raw, description) => invoke('hinana-publish', raw, description), hinanaCancel: () => invoke('hinana-cancel'), hinanaReopen: () => invoke('hinana-reopen'), hinanaOpen: id => invoke('hinana-open', id),
  ready: () => invoke('ready'), recover: () => invoke('recover'), autosave: raw => invoke('autosave', raw), resetPath: () => invoke('reset-path'),
  open: () => invoke('open'), save: (raw, saveAs) => invoke('save', raw, saveAs), importText: () => invoke('import-text'), font: () => invoke('font'), export: raw => invoke('export', raw),
  confirmUnsaved: () => invoke('confirm-unsaved'), close: () => invoke('close'), onClose: cb => subscribe('close-request', cb), onCommand: cb => subscribe('command', cb)
});
