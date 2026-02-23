const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let mainWindow;
let serverProcess;
let tray;
let isQuitting = false;

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

  // Start server process (hide console window on Windows in production)
  const spawnOptions = {
    env: env,
    cwd: path.dirname(serverPath),
    windowsHide: true, // Hide console window on Windows
    // In production, use 'pipe' to hide console; in dev, use 'inherit' to see logs
    stdio: app.isPackaged ? ['ignore', 'ignore', 'ignore'] : 'inherit'
  };
  
  serverProcess = spawn('node', [serverPath], spawnOptions);

  serverProcess.on('error', (error) => {
    console.error('Error starting server:', error);
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  createTray();
  createWindow();

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
