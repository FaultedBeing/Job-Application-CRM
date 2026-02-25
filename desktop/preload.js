const { contextBridge, ipcRenderer } = require('electron');

// Expose a limited, safe API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => {
    return ipcRenderer.invoke('check-for-updates');
  },
  dialogResponse: (dialogId, buttonIndex) => {
    ipcRenderer.send('themed-dialog-response', dialogId, buttonIndex);
  },
  openExternal: (url) => {
    return ipcRenderer.invoke('open-external', url);
  },
  gmailOAuthConnect: (payload) => {
    return ipcRenderer.invoke('gmail-oauth-connect', payload);
  },
  gmailOAuthStatus: () => {
    return ipcRenderer.invoke('gmail-oauth-status');
  },
  gmailOAuthDisconnect: () => {
    return ipcRenderer.invoke('gmail-oauth-disconnect');
  },
  gmailSendTest: (payload) => {
    return ipcRenderer.invoke('gmail-send-test', payload);
  }
});
