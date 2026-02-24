const { app, BrowserWindow, Tray, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let serverProcess;
let tray;
let isQuitting = false;
let isManualUpdateCheck = false;
let isDownloadInProgress = false;
let themedDialogCounter = 0;


function loadPrereleaseSetting() {
  return new Promise((resolve) => {
    http.get('http://localhost:3000/api/settings', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const settings = JSON.parse(data);
          const allowPrerelease = settings.allow_prerelease === 'true';
          autoUpdater.allowPrerelease = allowPrerelease;
          console.log('[Auto-updater] allowPrerelease set to:', allowPrerelease);
        } catch (error) {
          console.error('[Auto-updater] Error parsing settings:', error);
          autoUpdater.allowPrerelease = false;
        }
        resolve();
      });
    }).on('error', (error) => {
      console.error('[Auto-updater] Error fetching settings:', error);
      autoUpdater.allowPrerelease = false;
      resolve();
    });
  });
}

// --- Themed in-app dialog system ---
function showThemedDialog(options) {
  // options: { type, title, message, detail, buttons, defaultId }
  // Returns a promise that resolves with { response: buttonIndex }
  if (!mainWindow || mainWindow.isDestroyed()) {
    return dialog.showMessageBox(options);
  }

  const dialogId = 'dlg_' + (++themedDialogCounter);
  const type = options.type || 'info';
  const title = options.title || '';
  const message = options.message || '';
  const detail = (options.detail || '').replace(/\n/g, '<br>');
  const buttons = options.buttons || ['OK'];
  const defaultId = options.defaultId !== undefined ? options.defaultId : 0;

  // Pass all data as a JSON blob to avoid escaping nightmares
  const dialogData = JSON.stringify({
    dialogId, type, title, message, detail, buttons, defaultId
  });

  const script = `
    (function() {
      var data = ${dialogData};

      var iconSvgs = {
        info: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        warning: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        error: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      };

      // Remove existing dialog if any
      var old = document.getElementById(data.dialogId);
      if (old) old.remove();

      // Add animation styles once
      if (!document.getElementById('themed-dialog-styles')) {
        var style = document.createElement('style');
        style.id = 'themed-dialog-styles';
        style.textContent = '@keyframes tdFadeIn{from{opacity:0}to{opacity:1}} @keyframes tdSlideIn{from{opacity:0;transform:scale(0.95) translateY(-8px)}to{opacity:1;transform:scale(1) translateY(0)}} .td-btn:hover{filter:brightness(1.15);}';
        document.head.appendChild(style);
      }

      // Create overlay
      var overlay = document.createElement('div');
      overlay.id = data.dialogId;
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;backdrop-filter:blur(2px);animation:tdFadeIn 0.15s ease-out;';

      // Create card
      var card = document.createElement('div');
      card.style.cssText = 'background:#1a1d24;border:1px solid #2d3139;border-radius:12px;padding:28px 32px;max-width:460px;width:90%;box-shadow:0 12px 48px rgba(0,0,0,0.6);animation:tdSlideIn 0.2s ease-out;';

      // Header (icon + title + message)
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:flex-start;gap:14px;margin-bottom:16px;';

      var iconDiv = document.createElement('div');
      iconDiv.style.cssText = 'flex-shrink:0;margin-top:2px;';
      iconDiv.innerHTML = iconSvgs[data.type] || iconSvgs.info;

      var textDiv = document.createElement('div');

      var titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-size:1.05rem;font-weight:700;color:#fbbf24;margin-bottom:6px;';
      titleEl.textContent = data.title;

      var msgEl = document.createElement('div');
      msgEl.style.cssText = 'font-size:0.95rem;color:#e5e7eb;line-height:1.5;';
      msgEl.textContent = data.message;

      textDiv.appendChild(titleEl);
      textDiv.appendChild(msgEl);
      header.appendChild(iconDiv);
      header.appendChild(textDiv);
      card.appendChild(header);

      // Detail text
      if (data.detail) {
        var detailEl = document.createElement('div');
        detailEl.style.cssText = 'font-size:0.85rem;color:#9ca3af;line-height:1.6;margin-bottom:20px;padding-left:42px;';
        detailEl.innerHTML = data.detail;
        card.appendChild(detailEl);
      }

      // Buttons
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;padding-top:4px;';

      data.buttons.forEach(function(label, idx) {
        var btn = document.createElement('button');
        btn.className = 'td-btn';
        btn.textContent = label;
        var isPrimary = (idx === data.defaultId);
        btn.style.cssText = isPrimary
          ? 'padding:8px 22px;border:none;border-radius:6px;font-size:0.9rem;font-weight:600;cursor:pointer;background:#fbbf24;color:#0f1115;transition:filter 0.15s;'
          : 'padding:8px 22px;border:1px solid #2d3139;border-radius:6px;font-size:0.9rem;font-weight:500;cursor:pointer;background:#2d3139;color:#e5e7eb;transition:filter 0.15s;';
        btn.addEventListener('click', function() {
          window.electronAPI.dialogResponse(data.dialogId, idx);
          overlay.remove();
        });
        btnRow.appendChild(btn);
      });

      card.appendChild(btnRow);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    })();
  `;

  return new Promise((resolve) => {
    const handler = (_event, respDialogId, buttonIndex) => {
      if (respDialogId === dialogId) {
        ipcMain.removeListener('themed-dialog-response', handler);
        resolve({ response: buttonIndex });
      }
    };
    ipcMain.on('themed-dialog-response', handler);

    mainWindow.webContents.executeJavaScript(script).catch(() => {
      ipcMain.removeListener('themed-dialog-response', handler);
      dialog.showMessageBox(mainWindow, options).then(resolve);
    });
  });
}

function showFirstBootWelcome() {
  if (!app.isPackaged) {
    // Skip in development
    return;
  }
  
  const welcomeFlagPath = path.join(app.getPath('userData'), '.welcome-shown');
  
  // Check if welcome has been shown before
  if (fs.existsSync(welcomeFlagPath)) {
    return;
  }
  
  // Wait for window to be ready, then show welcome
  setTimeout(() => {
    if (mainWindow) {
      showThemedDialog({
        type: 'info',
        title: 'Welcome to Job Application Tracker!',
        message: 'Quick Tip: Minimizing to Tray',
        detail: 'When you close the window using the X button, the app will minimize to the system tray and continue running in the background.\n\n' +
                'To fully quit the application:\n' +
                '• Right-click the tray icon (in your system tray)\n' +
                '• Select "Quit"\n\n' +
                'This allows the app to keep running so you can quickly access it again!',
        buttons: ['Got it!'],
        defaultId: 0
      }).then(() => {
        // Mark welcome as shown
        try {
          fs.writeFileSync(welcomeFlagPath, '1');
        } catch (error) {
          console.error('Error saving welcome flag:', error);
        }
      });
    }
  }, 2000); // Wait 2 seconds after window loads
}

// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, let user choose
autoUpdater.autoInstallOnAppQuit = true; // Install on quit if update is ready

function createTray() {
  if (tray) return;
  try {
    const { nativeImage } = require('electron');
    let iconPath = null;
    
    // In production, try multiple possible locations for the icon
    if (app.isPackaged) {
      // Try resources path first (where extraResources are placed)
      const resourcesPath = process.resourcesPath || __dirname;
      
      // Try icon.ico first (better for Windows), then icon.png
      const iconIcoPath = path.join(resourcesPath, 'icon.ico');
      const iconPngPath = path.join(resourcesPath, 'icon.png');
      
      // Also try in the app directory (if icon is bundled with app)
      const appIconIcoPath = path.join(__dirname, 'icon.ico');
      const appIconPngPath = path.join(__dirname, 'icon.png');
      
      if (fs.existsSync(iconIcoPath)) {
        iconPath = iconIcoPath;
      } else if (fs.existsSync(iconPngPath)) {
        iconPath = iconPngPath;
      } else if (fs.existsSync(appIconIcoPath)) {
        iconPath = appIconIcoPath;
      } else if (fs.existsSync(appIconPngPath)) {
        iconPath = appIconPngPath;
      } else {
        // Try to get icon from the executable itself
        const exePath = process.execPath;
        if (fs.existsSync(exePath)) {
          // On Windows, we can try to extract icon from exe
          iconPath = exePath;
        }
      }
    } else {
      // Development: use __dirname
      const iconIcoPath = path.join(__dirname, 'icon.ico');
      const iconPngPath = path.join(__dirname, 'icon.png');
      
      if (fs.existsSync(iconIcoPath)) {
        iconPath = iconIcoPath;
      } else if (fs.existsSync(iconPngPath)) {
        iconPath = iconPngPath;
      }
    }
    
    if (iconPath) {
      // Create native image from path
      const iconImage = nativeImage.createFromPath(iconPath);
      if (!iconImage.isEmpty()) {
        // Resize to appropriate tray size (typically 16x16 or 32x32)
        const resizedIcon = iconImage.resize({ width: 16, height: 16 });
        tray = new Tray(resizedIcon);
      } else {
        // Fallback to empty icon if image couldn't be loaded
        const emptyIcon = nativeImage.createEmpty();
        tray = new Tray(emptyIcon);
      }
    } else {
      // Use a native image as fallback (empty 16x16 image)
      const emptyIcon = nativeImage.createEmpty();
      tray = new Tray(emptyIcon);
    }
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Check for Updates',
        click: () => {
          checkForUpdates(true);
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setToolTip('Job Application Tracker');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
      }
    });
  } catch (error) {
    console.error('Error creating tray:', error);
    // Continue without tray if it fails
  }
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(check, 500);
        }
      });
    }
    check();
  });
}

function updateSplashStatus(message, progress) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const script = `
    if (window.__updateSplash) {
      window.__updateSplash(${JSON.stringify(message)}, ${typeof progress === 'number' ? progress : 'undefined'});
    }
  `;
  mainWindow.webContents.executeJavaScript(script).catch(() => {});
}

function createWindow() {
  // Set window icon (try ICO first for Windows, then PNG)
  const iconIcoPath = path.join(__dirname, 'icon.ico');
  const iconPngPath = path.join(__dirname, 'icon.png');
  let windowIcon = null;
  if (fs.existsSync(iconIcoPath)) {
    windowIcon = iconIcoPath;
  } else if (fs.existsSync(iconPngPath)) {
    windowIcon = iconPngPath;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f1115',
    show: true,
    icon: windowIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Show a lightweight splash immediately
  mainWindow.loadURL('data:text/html;charset=utf-8,' +
    encodeURIComponent(`
      <html>
        <head>
          <title>Job Application Tracker</title>
          <style>
            body { margin:0; background:#0f1115; color:#e5e7eb; display:flex; align-items:center; justify-content:center; font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
            .box { text-align:center; }
            .status { margin-top: 0.5rem; font-size: 0.9rem; color: #9ca3af; }
            .bar-container {
              margin-top: 1rem;
              width: 220px;
              height: 6px;
              border-radius: 999px;
              background: #111827;
              overflow: hidden;
              border: 1px solid #1f2937;
            }
            .bar-fill {
              height: 100%;
              width: 10%;
              background: linear-gradient(to right, #fbbf24, #22c55e);
              transition: width 0.3s ease-out;
            }
            .spinner {
              width: 32px;
              height: 32px;
              border-radius: 999px;
              border: 3px solid #374151;
              border-top-color: #fbbf24;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 1rem;
            }
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="spinner"></div>
            <div>Starting Job Tracker...</div>
            <div id="status" class="status">Booting backend server...</div>
            <div class="bar-container">
              <div id="bar" class="bar-fill"></div>
            </div>
          </div>
          <script>
            window.__updateSplash = function(message, progress) {
              var statusEl = document.getElementById('status');
              if (statusEl && typeof message === 'string') {
                statusEl.textContent = message;
              }
              var barEl = document.getElementById('bar');
              if (barEl && typeof progress === 'number') {
                var pct = Math.max(5, Math.min(100, progress));
                barEl.style.width = pct + '%';
              }
            };
          </script>
        </body>
      </html>
    `));

  // Start backend server
  updateSplashStatus('Starting backend server...', 20);
  startServer();

  // Once server responds, load frontend
  waitForServer('http://localhost:3000/health')
    .then(() => {
      updateSplashStatus('Loading interface...', 90);
      if (mainWindow) {
        mainWindow.loadURL('http://localhost:3000');
      }
    })
    .catch((err) => {
      console.error('Error waiting for server:', err);
      if (mainWindow) {
        mainWindow.loadURL('data:text/html;charset=utf-8,' +
          encodeURIComponent('<html><body style=\"background:#0f1115;color:#fca5a5;display:flex;align-items:center;justify-content:center;font-family:system-ui\">Failed to start server. Please restart the app.</body></html>'));
      }
    });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function startServer() {
  const isDev = !app.isPackaged;
  let serverPath;
  let nodeModulesPath;
  let frontendPath;

  if (isDev) {
    // Development paths
    serverPath = path.join(__dirname, '..', 'server', 'dist', 'index.js');
    nodeModulesPath = path.join(__dirname, '..', 'server', 'node_modules');
    frontendPath = path.join(__dirname, '..', 'client', 'dist');
  } else {
    // Production paths (from extraResources)
    const resourcesPath = process.resourcesPath;
    serverPath = path.join(resourcesPath, 'server-dist', 'index.js');
    nodeModulesPath = path.join(resourcesPath, 'server-node_modules');
    frontendPath = path.join(resourcesPath, 'client-dist');
  }

  // Set environment variables for server
  const env = {
    ...process.env,
    NODE_ENV: isDev ? 'development' : 'production',
    PORT: '3000',
    RESOURCES_PATH: isDev ? path.join(__dirname, '..') : process.resourcesPath,
    FRONTEND_PATH: frontendPath,
    APPDATA: app.getPath('userData')
  };

  // Set NODE_PATH to include server node_modules
  env.NODE_PATH = nodeModulesPath;

  // Always use bundled Node.js (self-contained, no dependencies required)
  let nodeExecutable = 'node'; // Default to system node (for development)
  
  if (app.isPackaged) {
    // In production, always use bundled Node.js
    const bundledNodePath = path.join(process.resourcesPath, 'node.exe');
    if (fs.existsSync(bundledNodePath)) {
      nodeExecutable = bundledNodePath;
      console.log('Using bundled Node.js');
    } else {
      // Fallback to system node if bundled not available (shouldn't happen)
      console.warn('Bundled Node.js not found, falling back to system Node.js');
      nodeExecutable = 'node';
    }
  }

  // Start server process (hide console window on Windows in production)
  const spawnOptions = {
    env: env,
    cwd: path.dirname(serverPath),
    windowsHide: true, // Hide console window on Windows
    // In production, use 'pipe' to hide console; in dev, use 'inherit' to see logs
    stdio: app.isPackaged ? ['ignore', 'ignore', 'ignore'] : 'inherit'
  };
  
  serverProcess = spawn(nodeExecutable, [serverPath], spawnOptions);

  serverProcess.on('error', (error) => {
    console.error('Error starting server:', error);
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
}

// --- Download progress overlay (injected into renderer) ---
function showDownloadOverlay(version) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      // Remove any existing overlay
      var old = document.getElementById('update-download-overlay');
      if (old) old.remove();

      var overlay = document.createElement('div');
      overlay.id = 'update-download-overlay';
      overlay.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;background:#1a1d24;border:1px solid #2d3139;border-radius:12px;padding:20px 24px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;color:#e5e7eb;';

      overlay.innerHTML = 
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
          '<div id="update-spinner" style="width:18px;height:18px;border-radius:50%;border:2px solid #374151;border-top-color:#fbbf24;animation:updSpin 0.8s linear infinite;flex-shrink:0;"></div>' +
          '<span style="font-weight:600;font-size:0.95rem;">Downloading v${version}...</span>' +
        '</div>' +
        '<div style="background:#111827;border-radius:999px;height:8px;overflow:hidden;border:1px solid #1f2937;margin-bottom:8px;">' +
          '<div id="update-bar" style="height:100%;width:0%;background:linear-gradient(to right,#fbbf24,#22c55e);transition:width 0.3s ease-out;border-radius:999px;"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#9ca3af;">' +
          '<span id="update-percent">0%</span>' +
          '<span id="update-speed"></span>' +
        '</div>';

      // Add spinner animation
      var style = document.createElement('style');
      style.id = 'update-download-style';
      style.textContent = '@keyframes updSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
      document.body.appendChild(overlay);
    })();
  `).catch(() => {});
}

function updateDownloadOverlay(percent, bytesPerSecond, transferred, total) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const pct = Math.round(percent);
  const speed = bytesPerSecond > 1048576
    ? (bytesPerSecond / 1048576).toFixed(1) + ' MB/s'
    : (bytesPerSecond / 1024).toFixed(0) + ' KB/s';
  const dlMB = (transferred / 1048576).toFixed(1);
  const totalMB = (total / 1048576).toFixed(1);

  mainWindow.webContents.executeJavaScript(`
    (function() {
      var bar = document.getElementById('update-bar');
      var pctEl = document.getElementById('update-percent');
      var speedEl = document.getElementById('update-speed');
      if (bar) bar.style.width = '${pct}%';
      if (pctEl) pctEl.textContent = '${pct}%  (${dlMB} / ${totalMB} MB)';
      if (speedEl) speedEl.textContent = '${speed}';
    })();
  `).catch(() => {});
}

function removeDownloadOverlay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      var el = document.getElementById('update-download-overlay');
      if (el) el.remove();
      var st = document.getElementById('update-download-style');
      if (st) st.remove();
    })();
  `).catch(() => {});
}

// Auto-updater event handlers
function setupAutoUpdater() {
  if (!app.isPackaged) {
    // Skip auto-updates in development
    return;
  }

  // Configure electron-updater with GitHub repo info directly
  // Hardcoded here because electron-builder strips the 'build' section from package.json
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'FaultedBeing',
      repo: 'Job-Application-CRM'
    });
    console.log('[Auto-updater] Feed URL configured: FaultedBeing/Job-Application-CRM');
  } catch (error) {
    console.error('[Auto-updater] Error configuring feed URL:', error);
    return; // Can't do anything without a feed URL
  }

  // --- Event handlers (these handle ALL update UI) ---

  autoUpdater.on('checking-for-update', () => {
    console.log('[Auto-updater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Auto-updater] Update available:', info.version);
    isManualUpdateCheck = false; // Reset flag, we're showing a dialog regardless
    if (mainWindow) {
      showThemedDialog({
        type: 'info',
        title: 'Update Available',
        message: `A new version (v${info.version}) is available!`,
        detail: `You are currently running v${app.getVersion()}.\n\nWould you like to download and install it now?`,
        buttons: ['Download Now', 'Later'],
        defaultId: 0
      }).then((result) => {
        if (result.response === 0) {
          isDownloadInProgress = true;
          showDownloadOverlay(info.version);
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Auto-updater] No update available. Current version:', app.getVersion(), '| Latest:', info.version);
    if (isManualUpdateCheck && mainWindow) {
      showThemedDialog({
        type: 'info',
        title: 'No Updates Available',
        message: 'You are running the latest version!',
        detail: `Current version: v${app.getVersion()}`,
        buttons: ['OK'],
        defaultId: 0
      });
    }
    isManualUpdateCheck = false;
  });

  autoUpdater.on('error', (err) => {
    const errMsg = err.message || err.toString() || '';
    console.error('[Auto-updater] Error:', errMsg);
    
    // Clean up any download UI
    const wasDownloading = isDownloadInProgress;
    isDownloadInProgress = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }
    removeDownloadOverlay();
    
    // Show error dialog if user explicitly triggered the check OR a download was in progress
    if ((isManualUpdateCheck || wasDownloading) && mainWindow) {
      let title = 'Update Check';
      let message = 'Could not check for updates.';
      let detail = '';

      if (wasDownloading) {
        title = 'Download Failed';
        message = 'The update download failed.';
        detail = 'An error occurred while downloading the update.\n\nPlease try again later.\n\n' +
                 `Error: ${errMsg}`;
      } else if (errMsg.includes('net::ERR_INTERNET_DISCONNECTED') || 
          errMsg.includes('ENOTFOUND') ||
          errMsg.includes('ECONNREFUSED') ||
          errMsg.includes('getaddrinfo')) {
        message = 'No internet connection.';
        detail = 'Please check your internet connection and try again.';
      } else if (errMsg.includes('404') || errMsg.includes('Not Found') ||
                 errMsg.includes('406') || errMsg.includes('Not Acceptable') ||
                 errMsg.includes('Unable to find latest version') ||
                 errMsg.includes('HttpError')) {
        message = 'No published updates found.';
        detail = 'No compatible release was found on GitHub.\n\n' +
                 'This usually means the release is missing the required latest.yml file, ' +
                 'or no full releases have been published yet.\n\n' +
                 `Current version: v${app.getVersion()}`;
      } else {
        message = 'Update check failed.';
        detail = 'An unexpected error occurred while checking for updates.\n\n' +
                 'You can continue using the app normally.\n\n' +
                 `Error: ${errMsg}`;
      }

      showThemedDialog({
        type: 'warning',
        title: title,
        message: message,
        detail: detail,
        buttons: ['OK'],
        defaultId: 0
      });
    }
    isManualUpdateCheck = false;
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = progressObj.percent.toFixed(1);
    console.log(`[Auto-updater] Download: ${percent}% (${progressObj.transferred}/${progressObj.total})`);
    
    // Update the Windows taskbar progress bar
    if (mainWindow) {
      mainWindow.setProgressBar(progressObj.percent / 100);
    }
    
    // Update the in-app download overlay
    updateDownloadOverlay(progressObj.percent, progressObj.bytesPerSecond, progressObj.transferred, progressObj.total);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Auto-updater] Update downloaded:', info.version);
    isDownloadInProgress = false;
    
    // Clear taskbar progress and remove overlay
    if (mainWindow) {
      mainWindow.setProgressBar(-1);
      removeDownloadOverlay();
      
      // Small delay to let the overlay removal complete before showing the dialog
      setTimeout(() => {
        showThemedDialog({
          type: 'info',
          title: 'Update Ready',
          message: 'Update downloaded successfully!',
          detail: `Version v${info.version} is ready to install.\nThe application will restart to apply the update.`,
          buttons: ['Restart Now', 'Later'],
          defaultId: 0
        }).then((result) => {
          if (result.response === 0) {
            // Kill server process first to release all file locks
            if (serverProcess) {
              try {
                serverProcess.kill('SIGTERM');
                serverProcess = null;
              } catch (e) {
                console.error('Error killing server before update:', e);
              }
            }
            // Give the server a moment to fully shut down, then install
            setTimeout(() => {
              isQuitting = true;
              autoUpdater.quitAndInstall(true, true);
            }, 1000);
          }
        });
      }, 500);
    }
  });

  // --- Startup update check ---
  // Wait for server to be ready (so prerelease setting can be loaded), then check
  setTimeout(async () => {
    try {
      await loadPrereleaseSetting();
    } catch (e) {
      console.error('[Auto-updater] Failed to load prerelease setting:', e);
    }
    console.log('[Auto-updater] Running startup update check...');
    checkForUpdates(false);
  }, 8000); // 8 seconds: server needs ~5s to start, then we load settings
}

function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual && mainWindow) {
      showThemedDialog({
        type: 'info',
        title: 'Development Mode',
        message: 'Auto-updates are disabled in development mode.',
        buttons: ['OK'],
        defaultId: 0
      });
    }
    return;
  }

  isManualUpdateCheck = manual;
  console.log(`[Auto-updater] checkForUpdates called (manual: ${manual}, allowPrerelease: ${autoUpdater.allowPrerelease})`);
  
  // Just call checkForUpdates — all UI is handled by event handlers above
  autoUpdater.checkForUpdates().catch((err) => {
    // The 'error' event handler will show the dialog if needed.
    // This .catch() just prevents unhandled promise rejection warnings.
    console.error('[Auto-updater] checkForUpdates promise rejected:', err.message || err);
  });
}

// IPC handler so renderer (Settings page) can trigger update checks
ipcMain.handle('check-for-updates', async () => {
  // Reload prerelease setting in case user just toggled it
  try {
    await loadPrereleaseSetting();
  } catch (e) {
    console.error('[Auto-updater] Failed to reload prerelease setting:', e);
  }
  checkForUpdates(true);
});

app.whenReady().then(() => {
  // Remove the menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);
  
  createTray();
  createWindow();
  setupAutoUpdater();
  showFirstBootWelcome();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Kill server process
  if (serverProcess) {
    serverProcess.kill();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Kill server process
  if (serverProcess) {
    serverProcess.kill();
  }
});
