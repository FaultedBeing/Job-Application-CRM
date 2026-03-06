const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let pendingDeepLink = null;
let serverProcess;
let tray;
let isQuitting = false;
let isManualUpdateCheck = false;
let themedDialogCounter = 0;
let reminderPollInterval = null;
let enableLocalUpdates = false;
let discordPollInterval = null;

const gmailTokenPath = path.join(app.getPath('userData'), 'gmail-oauth.json');

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function httpFormPost(url, formObj) {
  const body = new URLSearchParams(formObj).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error('Invalid JSON response from token endpoint'));
            }
          } else {
            reject(new Error(`Token request failed: ${res.statusCode} ${raw}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpJsonGet(url, accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            reject(new Error(`GET failed: ${res.statusCode} ${raw}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function httpGmailSend(accessToken, rawMessage) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ raw: rawMessage });
    const req = https.request(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (_e) {
              resolve(raw);
            }
          } else {
            reject(new Error(`Gmail send failed: ${res.statusCode} ${raw}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function readGmailToken() {
  try {
    if (fs.existsSync(gmailTokenPath)) {
      return JSON.parse(fs.readFileSync(gmailTokenPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('[Gmail] Failed to read token file:', e?.message || e);
  }
  return null;
}

function writeGmailToken(data) {
  try {
    fs.writeFileSync(gmailTokenPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Gmail] Failed to write token file:', e?.message || e);
  }
}

async function ensureFreshAccessToken(clientId, clientSecret) {
  const tok = readGmailToken();
  if (!tok || !tok.refresh_token) {
    throw new Error('Not connected to Google');
  }
  const now = Date.now();
  if (tok.access_token && tok.expires_at && now < tok.expires_at - 30_000) {
    return tok.access_token;
  }
  const refreshed = await httpFormPost('https://oauth2.googleapis.com/token', {
    client_id: clientId || tok.client_id,
    client_secret: clientSecret || tok.client_secret || '',
    grant_type: 'refresh_token',
    refresh_token: tok.refresh_token
  });
  const expiresAt = Date.now() + (refreshed.expires_in || 3600) * 1000;
  writeGmailToken({
    ...tok,
    client_id: clientId || tok.client_id,
    client_secret: clientSecret || tok.client_secret || '',
    access_token: refreshed.access_token,
    expires_at: expiresAt
  });
  return refreshed.access_token;
}

async function gmailOAuthConnectFlow(clientId, clientSecret) {
  if (!clientId || typeof clientId !== 'string') throw new Error('clientId is required');
  if (!clientSecret || typeof clientSecret !== 'string') throw new Error('clientSecret is required');

  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());

  // Loopback server on an ephemeral port
  const server = http.createServer();
  const codePromise = new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        if (urlObj.pathname !== '/oauth2callback') {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const code = urlObj.searchParams.get('code');
        const err = urlObj.searchParams.get('error');
        if (err) {
          res.statusCode = 200;
          res.end('Sign-in cancelled. You can close this tab.');
          reject(new Error(`Google OAuth error: ${err}`));
          return;
        }
        if (!code) {
          res.statusCode = 400;
          res.end('Missing code');
          reject(new Error('Missing OAuth code'));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end('<html><body style="font-family:system-ui;background:#0f1115;color:#e5e7eb;padding:24px;">Connected. You can close this window.</body></html>');
        resolve(code);
      } catch (e) {
        reject(e);
      }
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'openid',
    'email'
  ];
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    }).toString();

  const authWin = new BrowserWindow({
    width: 520,
    height: 720,
    resizable: true,
    modal: true,
    parent: mainWindow || undefined,
    backgroundColor: '#0f1115',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  authWin.loadURL(authUrl);

  let code;
  try {
    code = await codePromise;
  } finally {
    try {
      authWin.close();
    } catch (_) { }
    try {
      server.close();
    } catch (_) { }
  }

  const tokenRes = await httpFormPost('https://oauth2.googleapis.com/token', {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const expiresAt = Date.now() + (tokenRes.expires_in || 3600) * 1000;
  const tokenData = {
    client_id: clientId,
    client_secret: clientSecret,
    access_token: tokenRes.access_token,
    refresh_token: tokenRes.refresh_token,
    expires_at: expiresAt
  };

  // Get connected email (best effort)
  let email = null;
  try {
    const profile = await httpJsonGet('https://www.googleapis.com/oauth2/v3/userinfo', tokenRes.access_token);
    email = profile?.email || null;
  } catch (_e) { }

  writeGmailToken({ ...tokenData, email });
  return { email };
}


function setupSpellcheckAndContextMenu(win) {
  if (!win || win.isDestroyed()) return;

  // Enable spellchecker dictionaries (best-effort)
  try {
    const locale = app.getLocale ? app.getLocale() : 'en-US';
    const normalized = typeof locale === 'string' && locale.includes('-') ? locale : 'en-US';
    win.webContents.session.setSpellCheckerLanguages([normalized]);
  } catch (e) {
    console.warn('[Spellcheck] Unable to set spellchecker languages:', e?.message || e);
  }

  // Right-click menu with spellcheck suggestions
  win.webContents.on('context-menu', (_event, params) => {
    try {
      const template = [];

      // Spellcheck suggestions (only show when Chromium marked a misspelled word)
      if (params.misspelledWord) {
        const suggestions = Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : [];

        if (suggestions.length > 0) {
          suggestions.slice(0, 8).forEach((suggestion) => {
            template.push({
              label: suggestion,
              click: () => {
                try {
                  win.webContents.replaceMisspelling(suggestion);
                } catch (_) { }
              }
            });
          });
        } else {
          template.push({ label: 'No suggestions', enabled: false });
        }

        template.push({ type: 'separator' });
        template.push({
          label: `Add "${params.misspelledWord}" to dictionary`,
          click: () => {
            try {
              win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord);
            } catch (_) { }
          }
        });
        template.push({ type: 'separator' });
      }

      // Editing actions
      if (params.isEditable) {
        template.push(
          { role: 'undo', enabled: params.editFlags?.canUndo },
          { role: 'redo', enabled: params.editFlags?.canRedo },
          { type: 'separator' },
          { role: 'cut', enabled: params.editFlags?.canCut },
          { role: 'copy', enabled: params.editFlags?.canCopy },
          { role: 'paste', enabled: params.editFlags?.canPaste },
          { role: 'delete', enabled: params.editFlags?.canDelete },
          { type: 'separator' },
          { role: 'selectAll' }
        );
      } else {
        if (params.selectionText) {
          template.push({ role: 'copy' });
          template.push({ type: 'separator' });
        }
      }

      // Link actions (optional)
      if (params.linkURL) {
        template.push({
          label: 'Open Link',
          click: () => shell.openExternal(params.linkURL)
        });
        template.push({ type: 'separator' });
      }

      // Nothing to show
      if (template.length === 0) return;

      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: win });
    } catch (e) {
      console.warn('[ContextMenu] Failed to show context menu:', e?.message || e);
    }
  });
}


function loadUpdateSettings() {
  return new Promise((resolve) => {
    http.get('http://localhost:3001/api/settings', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const settings = JSON.parse(data);
          const allowPrereleaseValue = settings.allow_prerelease === 'true';
          autoUpdater.allowPrerelease = allowPrereleaseValue;
          enableLocalUpdates = settings.enable_local_updates === 'true';
          console.log('[Auto-updater] allowPrerelease:', allowPrereleaseValue, '| enableLocalUpdates:', enableLocalUpdates);
        } catch (error) {
          console.error('[Auto-updater] Error parsing settings:', error);
          autoUpdater.allowPrerelease = false;
          enableLocalUpdates = false;
        }
        resolve();
      });
    }).on('error', (error) => {
      console.error('[Auto-updater] Error fetching settings:', error);
      autoUpdater.allowPrerelease = false;
      enableLocalUpdates = false;
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
    tray.setToolTip('Job Application CRM - Cloud');
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

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  const logPath = path.join(app.getPath('userData'), 'server-log.txt');

  return new Promise((resolve, reject) => {
    function check() {
      const targetUrl = url.replace('localhost', '127.0.0.1');
      const req = http.get(targetUrl, (res) => {
        res.destroy();
        resolve(true);
      });
      req.on('error', (err) => {
        if (Date.now() - start > timeoutMs) {
          const msg = `Server did not start in time. Last error: ${err.message} at ${targetUrl}`;
          fs.appendFileSync(logPath, `\n[ERROR] waitForServer: ${msg}\n`);
          reject(new Error(msg));
        } else {
          setTimeout(check, 1000); // 1s interval is easier on logs
        }
      });
    }
    check();
  });
}

function apiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3033,
        path: `/api${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : undefined
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(raw ? JSON.parse(raw) : null);
            } catch (_e) {
              resolve(raw);
            }
          } else {
            reject(new Error(`API ${method} ${apiPath} failed: ${res.statusCode} ${raw}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function fetchAppSettings() {
  try {
    const s = await apiRequest('GET', '/settings', null);
    return s || {};
  } catch (_e) {
    return {};
  }
}

async function deliverDesktopNotifications(settings) {
  try {
    const now = new Date().toISOString();
    const pending = await apiRequest(
      'GET',
      `/notifications/pending?channel=desktop&now=${encodeURIComponent(now)}&limit=50`,
      null
    );
    if (!Array.isArray(pending) || pending.length === 0) return;

    const threshold = parseInt(settings.notification_desktop_summary_threshold || '5', 10) || 5;
    const count = pending.length;

    const markAllDelivered = async () => {
      await Promise.all(
        pending.map((n) =>
          apiRequest('POST', `/notifications/${n.id}/delivered`, { channel: 'desktop' }).catch(() => null)
        )
      );
    };

    if (Notification && Notification.isSupported && !Notification.isSupported()) {
      // Notifications not supported on this OS — don't mark as delivered; they'll retry on next poll
      return;
    }

    if (count >= threshold) {
      const notif = new Notification({
        title: 'Follow-ups due',
        body: `${count} items need attention. Open the app to review.`,
        silent: false
      });
      notif.on('click', () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.loadURL(`http://localhost:3033/?notifications=1`).catch(() => { });
        }
      });
      notif.show();
      await markAllDelivered();
      return;
    }

    // Under threshold: show a few individual popups, but mark all as delivered
    for (const n of pending.slice(0, 5)) {
      const options = {
        title: n.title || 'Follow-up reminder',
        body: n.message || 'Reminder due',
        silent: false
      };
      if (n.logo_url) {
        options.icon = n.logo_url;
      }

      const notif = new Notification(options);
      notif.on('click', () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          if (n.link_path) {
            mainWindow.loadURL(`http://localhost:3033${n.link_path}`).catch(() => { });
          } else {
            mainWindow.loadURL(`http://localhost:3033/?notifications=1`).catch(() => { });
          }
        }
      });
      notif.show();
    }
    await markAllDelivered();
  } catch (_e) {
    // Ignore transient errors
  }
}

// Legacy helper (kept for completeness; not currently used for reminders)
async function sendEmailToSelf(subject, body, clientIdOverride, recipientOverride) {
  const tok = readGmailToken();
  const clientId = clientIdOverride || tok?.client_id;
  const clientSecret = tok?.client_secret || '';
  if (!clientId) throw new Error('Missing Gmail client ID');
  if (!tok?.email) throw new Error('Connected email unknown');
  const to = recipientOverride || tok.email;
  const accessToken = await ensureFreshAccessToken(clientId, clientSecret);
  const mime =
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    'Content-Type: text/plain; charset="UTF-8"\r\n' +
    '\r\n' +
    body +
    '\r\n';
  const raw = base64UrlEncode(Buffer.from(mime, 'utf-8'));
  await httpGmailSend(accessToken, raw);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDueNoSeconds(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function primaryLabel(n) {
  if (n.primary_label) return n.primary_label;
  return n.message || 'Follow-up reminder';
}

async function hydrateNotificationLabels(pending) {
  try {
    const contactIds = new Set();
    const jobIds = new Set();
    const companyIds = new Set();
    const interactionIds = new Set();

    for (const n of pending) {
      const path = typeof n.link_path === 'string' ? n.link_path : '';
      const parts = path.split('/');
      if (parts.length >= 3) {
        const type = parts[1];
        const idNum = parseInt(parts[2], 10);
        if (!Number.isFinite(idNum)) continue;
        if (type === 'contacts') contactIds.add(idNum);
        else if (type === 'job') jobIds.add(idNum);
        else if (type === 'company') companyIds.add(idNum);
      }

      if (n.entity_type === 'interaction' && Number.isFinite(n.entity_id)) {
        interactionIds.add(n.entity_id);
      }

      if (n.contact_id) {
        contactIds.add(n.contact_id);
      }
    }

    const contacts = {};
    const jobs = {};
    const companies = {};
    const interactions = {};

    await Promise.all([
      Promise.all(
        Array.from(contactIds).map(async (id) => {
          try {
            const c = await apiRequest('GET', `/contacts/${id}`, null);
            if (c) contacts[id] = c;
          } catch (_e) {
            // ignore missing
          }
        })
      ),
      Promise.all(
        Array.from(jobIds).map(async (id) => {
          try {
            const j = await apiRequest('GET', `/jobs/${id}`, null);
            if (j) jobs[id] = j;
          } catch (_e) {
            // ignore missing
          }
        })
      ),
      Promise.all(
        Array.from(companyIds).map(async (id) => {
          try {
            const co = await apiRequest('GET', `/companies/${id}`, null);
            if (co) companies[id] = co;
          } catch (_e) {
            // ignore missing
          }
        })
      ),
      Promise.all(
        Array.from(interactionIds).map(async (id) => {
          try {
            const i = await apiRequest('GET', `/interactions/${id}`, null);
            if (i) interactions[id] = i;
          } catch (_e) {
            // ignore missing
          }
        })
      )
    ]);

    function buildLabel(n) {
      const path = typeof n.link_path === 'string' ? n.link_path : '';
      const parts = path.split('/');
      let contactName = null;
      let companyName = null;
      let jobTitle = null;

      if (parts.length >= 3) {
        const type = parts[1];
        const idNum = parseInt(parts[2], 10);
        if (Number.isFinite(idNum)) {
          if (type === 'contacts') {
            const c = contacts[idNum];
            if (c) {
              contactName = c.name || null;
              companyName = c.company_name || null;
            }
          } else if (type === 'job') {
            const j = jobs[idNum];
            if (j) {
              jobTitle = j.title || null;
              companyName = (j.company && j.company.name) || j.company_name || companyName;

              if (n.contact_id) {
                const c = contacts[n.contact_id];
                if (c) contactName = c.name;
              }
            }
          } else if (type === 'company') {
            const co = companies[idNum];
            if (co) {
              companyName = co.name || null;
            }
          }
        }
      }

      if (n.entity_type === 'interaction') {
        const i = interactions[n.entity_id] || null;
        if (i) {
          contactName = i.contact_name || contactName;
          companyName = i.company_name || companyName;
          jobTitle = i.job_title || jobTitle;
        }
      }

      if (contactName && companyName) return `Reminder: ${contactName} @ ${companyName}`;
      if (contactName) return `Reminder: ${contactName}`;
      if (jobTitle && companyName) return `Reminder: ${jobTitle} @ ${companyName}`;
      if (jobTitle) return `Reminder: ${jobTitle}`;
      if (companyName) return `Follow-up reminder @ ${companyName}`;
      return 'Follow-up reminder';
    }

    for (const n of pending) {
      n.primary_label = buildLabel(n);
    }
  } catch (_e) {
    // If enrichment fails, we still fall back to message-based labels
  }
}


// Notifications are now handled via the Cloud Lambda.
// Local app only handles Desktop popups.

async function pollNotifications() {
  try {
    const settings = await getSettings();
    await deliverDesktopNotifications(settings);
  } catch (_e) {
    // Ignore transient errors
  }
}

function startPolling() {
  if (reminderPollInterval) return;
  pollNotifications();
  reminderPollInterval = setInterval(pollNotifications, 30 * 1000);
}

function stopPolling() {
  if (reminderPollInterval) {
    clearInterval(reminderPollInterval);
    reminderPollInterval = null;
  }
}

function updateSplashStatus(message, progress) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const script = `
    if (window.__updateSplash) {
      window.__updateSplash(${JSON.stringify(message)}, ${typeof progress === 'number' ? progress : 'undefined'});
    }
  `;
  mainWindow.webContents.executeJavaScript(script).catch(() => { });
}

function handleDeepLink(url) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'jobtracker:') return;
    const pathParam = parsed.searchParams.get('path');
    const targetPath = pathParam || parsed.pathname || '/';
    const safePath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    const targetUrl = `http://localhost:3000${safePath}`;
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.loadURL(targetUrl).catch(() => { });
    } else {
      pendingDeepLink = url;
    }
  } catch (e) {
    console.warn('[DeepLink] Failed to handle URL:', e?.message || e);
  }
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

  const startHidden = process.argv.includes('--hidden');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f1115',
    show: !startHidden,
    icon: windowIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Enable Chromium spellchecker for all inputs/textareas/contenteditable
      spellcheck: true
    }
  });

  // Open external links (target="_blank") in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  setupSpellcheckAndContextMenu(mainWindow);

  // Show a lightweight splash immediately
  mainWindow.loadURL('data:text/html;charset=utf-8,' +
    encodeURIComponent(`
      <html>
        <head>
          <title>Cloud Job Application Tracker</title>
          <style>
            body { margin:0; background:#0f1115; color:#e5e7eb; display:flex; align-items:center; justify-content:center; font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
            .box { text-align:center; }
            .status { margin-top: 0.5rem; font-size: 0.9rem; color: #9ca3af; }
            .bar-container {
              margin: 1rem auto 0;
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
            <div>Starting Cloud Job Application Tracker...</div>
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
  waitForServer('http://localhost:3033/health')
    .then(() => {
      updateSplashStatus('Loading interface...', 90);
      if (mainWindow) {
        startPolling();
        const target = pendingDeepLink ? null : 'http://localhost:3033';
        if (target) {
          mainWindow.loadURL(target);
        }
        if (pendingDeepLink) {
          handleDeepLink(pendingDeepLink);
          pendingDeepLink = null;
        }
      }
    })
    .catch((err) => {
      console.error('Error waiting for server:', err);
      const logPath = path.join(app.getPath('userData'), 'server-log.txt');
      let logSnippet = '';
      try {
        logSnippet = fs.readFileSync(logPath, 'utf8').split('\n').slice(-10).join('<br>');
      } catch (e) { }

      if (mainWindow) {
        mainWindow.loadURL('data:text/html;charset=utf-8,' +
          encodeURIComponent(`<html><body style=\"background:#0f1115;color:#fca5a5;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui;text-align:center;padding:20px\">
            <div style="font-size:1.2rem;margin-bottom:10px">Failed to start server</div>
            <div style="color:#9ca3af;font-size:0.9rem;margin-bottom:20px">${err.message}</div>
            <div style="background:#111827;padding:10px;border-radius:4px;font-family:monospace;font-size:0.8rem;text-align:left;width:100%;max-width:500px;overflow:auto;max-height:200px">
              ${logSnippet}
            </div>
            <button onclick="window.location.reload()" style="margin-top:20px;padding:10px 20px;background:#374151;color:white;border:none;border-radius:4px;cursor:pointer">Retry</button>
          </body></html>`));
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
    PORT: '3033',
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
    // In production, capture logs to a file for troubleshooting
    stdio: app.isPackaged ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  };

  serverProcess = spawn(nodeExecutable, [serverPath], spawnOptions);

  if (app.isPackaged && serverProcess.stdout && serverProcess.stderr) {
    const logPath = path.join(app.getPath('userData'), 'server-log.txt');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const timestamp = new Date().toISOString();
    logStream.write(`\n--- Server Start: ${timestamp} ---\n`);
    serverProcess.stdout.pipe(logStream);
    serverProcess.stderr.pipe(logStream);
    console.log(`Server logs redirected to: ${logPath}`);
  }

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

  // Configure electron-updater with GitHub repo info directly
  // Hardcoded here because electron-builder strips the 'build' section from package.json
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'FaultedBeing',
      repo: 'Job-Application-CRM',
      channel: 'cloud'
    });
    autoUpdater.channel = 'cloud';
    console.log('[Auto-updater] Feed URL configured: FaultedBeing/Job-Application-CRM (channel: cloud)');
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
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
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

    if (errMsg.includes('404') && errMsg.includes('cloud.yml')) {
      console.log('[Auto-updater] Ignoring 404 for cloud.yml (treated as no update available).');
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
      return;
    }

    if (mainWindow) {
      mainWindow.webContents.send('update-error', errMsg);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Auto-updater] Update downloaded:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  // --- Startup update check ---
  // Wait for server to be ready (so prerelease setting can be loaded), then check
  setTimeout(async () => {
    try {
      await loadUpdateSettings();
    } catch (e) {
      console.error('[Auto-updater] Failed to load update settings:', e);
    }
    console.log('[Auto-updater] Running startup update check...');
    checkForUpdates(false);
  }, 8000); // 8 seconds: server needs ~5s to start, then we load settings
}

function getLocalUpdatePath() {
  if (!app.isPackaged) return null;
  return path.dirname(process.execPath);
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
  console.log(`[Auto-updater] checkForUpdates called (manual: ${manual}, allowPrerelease: ${autoUpdater.allowPrerelease}, enableLocalUpdates: ${enableLocalUpdates})`);

  // If local updates enabled, check app directory first
  const localPath = getLocalUpdatePath();
  const latestYaml = localPath ? path.join(localPath, 'latest.yml') : null;

  if (enableLocalUpdates && latestYaml && fs.existsSync(latestYaml)) {
    console.log('[Auto-updater] Local latest.yml found, checking local version at:', localPath);
    try {
      const yamlContent = fs.readFileSync(latestYaml, 'utf-8');
      const versionMatch = yamlContent.match(/version:\s*(.+)/);
      if (versionMatch && versionMatch[1]) {
        const localVersion = versionMatch[1].trim();
        console.log(`[Auto-updater] Local update version found: ${localVersion}`);
        // Simulate an update available event since we found a local build package
        if (mainWindow) {
          mainWindow.webContents.send('update-available', { version: localVersion, isLocal: true });
        }
      } else {
        throw new Error('Could not parse version from local latest.yml');
      }
    } catch (err) {
      console.error('[Auto-updater] Error checking local feed:', err);
      if (mainWindow) mainWindow.webContents.send('update-error', 'Local update check failed: ' + err.message);
    }
    // We stop here to prevent it from going to GitHub when local overrides are enabled
    return;
  }
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'FaultedBeing',
      repo: 'Job-Application-CRM',
      channel: 'cloud'
    });
    autoUpdater.channel = 'cloud';
  } catch (err) {
    console.error('[Auto-updater] Error setting GitHub feed:', err);
  }

  // Final check
  autoUpdater.checkForUpdates().catch((err) => {
    // The 'error' event handler will show the dialog if needed.
    // This .catch() just prevents unhandled promise rejection warnings.
    console.error('[Auto-updater] checkForUpdates promise rejected:', err.message || err);
  });
}

// IPC handler to open URLs in the system's default browser
ipcMain.handle('open-external', async (_event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
  }
});

// Gmail OAuth (BYO client ID)
ipcMain.handle('gmail-oauth-status', async () => {
  const tok = readGmailToken();
  return { connected: !!tok?.refresh_token, email: tok?.email || null };
});

ipcMain.handle('gmail-oauth-disconnect', async () => {
  try {
    if (fs.existsSync(gmailTokenPath)) fs.unlinkSync(gmailTokenPath);
  } catch (e) {
    console.warn('[Gmail] Failed to delete token file:', e?.message || e);
  }
  return { ok: true };
});

ipcMain.handle('gmail-oauth-connect', async (_event, payload) => {
  const clientId = payload?.clientId;
  const clientSecret = payload?.clientSecret;
  const result = await gmailOAuthConnectFlow(clientId, clientSecret);
  return result;
});

ipcMain.handle('gmail-send-test', async (_event, payload) => {
  const tok = readGmailToken();
  const clientId = payload?.clientId || tok?.client_id;
  const clientSecret = tok?.client_secret || '';
  if (!clientId) throw new Error('Missing client ID. Paste it in Settings first.');
  const email = tok?.email;
  if (!email) throw new Error('Connected email unknown. Reconnect Google and try again.');
  const subject = payload?.subject || 'Test email';
  const body = payload?.body || 'Test';

  const accessToken = await ensureFreshAccessToken(clientId, clientSecret);
  const mime =
    `To: ${email}\r\n` +
    `Subject: ${subject}\r\n` +
    'Content-Type: text/plain; charset="UTF-8"\r\n' +
    '\r\n' +
    body +
    '\r\n';
  const raw = base64UrlEncode(Buffer.from(mime, 'utf-8'));
  await httpGmailSend(accessToken, raw);
  return { ok: true };
});

// IPC handler so renderer (Settings page) can trigger update checks
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
  // Reload prerelease setting in case user just toggled it
  try {
    await loadPrereleaseSetting();
  } catch (e) {
    console.error('[Auto-updater] Failed to reload prerelease setting:', e);
  }
  checkForUpdates(true);
});

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('quit-and-install', () => {
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
});

ipcMain.on('set-auto-launch', (_event, enabled) => {
  if (process.platform === 'win32' && app.isPackaged) {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: ['--hidden']
      });
      console.log(`[Auto-launch] ${enabled ? 'Enabled' : 'Disabled'}`);
    } catch (e) {
      console.warn('Failed to update login item settings:', e);
    }
  }
});

// Check for updates periodically
// ...

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // We got the lock. Listen for second instances.
  app.on('second-instance', (_event, commandLine) => {
    // When a second instance launches, it passes its command line args here.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }

    // Windows deep linking passes the URL as an argument
    if (process.platform === 'win32') {
      const urlArg = commandLine.find((arg) => typeof arg === 'string' && arg.startsWith('jobtracker://'));
      if (urlArg) {
        handleDeepLink(urlArg);
      }
    }
  });

  // Register custom protocol (after we know we have the lock)
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('jobtracker', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('jobtracker');
  }

  // On Windows, the protocol URL may be passed as a command-line argument to the FIRST instance
  if (process.platform === 'win32') {
    const urlArg = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith('jobtracker://'));
    if (urlArg) {
      pendingDeepLink = urlArg;
    }
  }
}

app.whenReady().then(() => {
  // Remove the menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);

  // On Windows, register app to start on login (hidden to tray) ONLY on first boot
  const welcomeFlagPath = path.join(app.getPath('userData'), '.welcome-shown');
  if (!fs.existsSync(welcomeFlagPath) && process.platform === 'win32' && app.isPackaged) {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: ['--hidden']
      });
    } catch (e) {
      console.warn('Failed to set login item settings:', e);
    }
  }

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
  stopPolling();
});
