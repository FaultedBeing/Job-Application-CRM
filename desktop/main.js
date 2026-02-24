const { app, BrowserWindow, Tray, Menu, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let serverProcess;
let tray;
let isQuitting = false;

// User preference for Node.js (default: bundled/self-contained)
function getNodeJsPreference() {
  const configPath = path.join(app.getPath('userData'), 'app-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.useSystemNodeJs === true; // Default to false (bundled)
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
  return false; // Default: use bundled Node.js
}

function setNodeJsPreference(useSystemNode) {
  const configPath = path.join(app.getPath('userData'), 'app-config.json');
  try {
    const config = { useSystemNodeJs: useSystemNode };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error writing config:', error);
  }
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
    function buildTrayMenu() {
      const useSystemNode = getNodeJsPreference();
      return Menu.buildFromTemplate([
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
          label: 'Node.js: ' + (useSystemNode ? 'System' : 'Bundled'),
          submenu: [
            {
              label: 'Use Bundled Node.js',
              type: 'radio',
              checked: !useSystemNode,
              click: () => {
                setNodeJsPreference(false);
                if (mainWindow) {
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Setting Changed',
                    message: 'Node.js preference updated to Bundled.',
                    detail: 'Please restart the application for this change to take effect.',
                    buttons: ['OK']
                  });
                }
                // Rebuild menu to reflect change
                if (tray) {
                  tray.setContextMenu(buildTrayMenu());
                }
              }
            },
            {
              label: 'Use System Node.js',
              type: 'radio',
              checked: useSystemNode,
              click: () => {
                setNodeJsPreference(true);
                if (mainWindow) {
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Setting Changed',
                    message: 'Node.js preference updated to System.',
                    detail: 'Please restart the application for this change to take effect.',
                    buttons: ['OK']
                  });
                }
                // Rebuild menu to reflect change
                if (tray) {
                  tray.setContextMenu(buildTrayMenu());
                }
              }
            }
          ]
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
    }
    
    const contextMenu = buildTrayMenu();
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
      contextIsolation: true
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

  // Determine which Node.js to use based on user preference
  let nodeExecutable = 'node'; // Default to system node (for development)
  
  if (app.isPackaged) {
    const useSystemNode = getNodeJsPreference();
    const { execSync } = require('child_process');
    
    if (useSystemNode) {
      // User prefers system Node.js - check if available
      let systemNodeAvailable = false;
      try {
        execSync('node --version', { stdio: 'ignore', timeout: 1000 });
        systemNodeAvailable = true;
      } catch (error) {
        systemNodeAvailable = false;
      }
      
      if (systemNodeAvailable) {
        nodeExecutable = 'node';
        console.log('Using system Node.js (user preference)');
      } else {
        // System Node.js not available, fall back to bundled
        console.warn('System Node.js not found, falling back to bundled');
        const bundledNodePath = path.join(process.resourcesPath, 'node.exe');
        if (fs.existsSync(bundledNodePath)) {
          nodeExecutable = bundledNodePath;
          console.log('Using bundled Node.js (fallback)');
        } else {
          console.error('Neither system nor bundled Node.js available!');
          nodeExecutable = 'node'; // Last resort
        }
      }
    } else {
      // User prefers bundled Node.js (default)
      const bundledNodePath = path.join(process.resourcesPath, 'node.exe');
      if (fs.existsSync(bundledNodePath)) {
        nodeExecutable = bundledNodePath;
        console.log('Using bundled Node.js (user preference)');
      } else {
        // Bundled not available, try system as fallback
        console.warn('Bundled Node.js not found, trying system Node.js');
        nodeExecutable = 'node';
      }
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

// Auto-updater event handlers
function setupAutoUpdater() {
  if (!app.isPackaged) {
    // Skip auto-updates in development
    return;
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available!`,
        detail: 'Would you like to download and install it now?',
        buttons: ['Download Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available. Current version is latest.');
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    console.log(logMessage);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully!',
      detail: 'The application will restart to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  // Check for updates on startup (after a delay to not interfere with app startup)
  setTimeout(() => {
    checkForUpdates(false);
  }, 5000); // Check 5 seconds after app starts
}

function checkForUpdates(showNoUpdateMessage = false) {
  if (!app.isPackaged) {
    if (showNoUpdateMessage) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Development Mode',
        message: 'Auto-updates are disabled in development mode.',
        buttons: ['OK']
      });
    }
    return;
  }

  autoUpdater.checkForUpdates().then((result) => {
    if (showNoUpdateMessage && !result.updateInfo) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates',
        message: 'You are running the latest version!',
        buttons: ['OK']
      });
    }
  }).catch((err) => {
    console.error('Error checking for updates:', err);
    if (showNoUpdateMessage) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates.',
        detail: err.message,
        buttons: ['OK']
      });
    }
  });
}

app.whenReady().then(() => {
  // Remove the menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);
  
  createTray();
  createWindow();
  setupAutoUpdater();

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
