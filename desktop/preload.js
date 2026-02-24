const { contextBridge, ipcRenderer } = require('electron');

// Expose a limited, safe API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => {
    return ipcRenderer.invoke('check-for-updates');
  },
  dialogResponse: (dialogId, buttonIndex) => {
    ipcRenderer.send('themed-dialog-response', dialogId, buttonIndex);
  }
});
