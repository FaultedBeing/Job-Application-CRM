const { contextBridge, ipcRenderer } = require('electron');

// Expose a limited, safe API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => {
    return ipcRenderer.invoke('get-app-version');
  },
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
  },
  // Update system
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_event, progress) => callback(progress));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (_event, err) => callback(err));
  },
  downloadUpdate: () => {
    ipcRenderer.send('download-update');
  },
  quitAndInstallUpdate: () => {
    ipcRenderer.send('quit-and-install');
  },
  setAutoLaunch: (enabled) => {
    ipcRenderer.send('set-auto-launch', enabled);
  }
});
