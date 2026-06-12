const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
  onMaximizedChanged: (cb) => {
    const listener = (_, val) => cb(val);
    ipcRenderer.on('win:maximized-changed', listener);
    return () => ipcRenderer.removeListener('win:maximized-changed', listener);
  },
  openExternal: (url) => ipcRenderer.send('open:external', url),
});
