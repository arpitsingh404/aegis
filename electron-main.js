'use strict';

/**
 * AEGIS desktop shell.
 * Boots the local agent server in-process, then opens the UI in a native window.
 * The same server can still be run alone with `npm run web` (localhost:7777).
 */

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = Number(process.env.AEGIS_PORT || 7791);
process.env.AEGIS_PORT = String(PORT);

app.setName('AEGIS');
app.setAppUserModelId('com.aegis.codingagent');

// The renderer only ever loads our own localhost page with a strict CSP.
// Chromium's sandbox fails to initialise on some Windows builds.
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

let win = null;
let serverStarted = false;

function crashLog(msg) {
  try {
    const file = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
  logLine('crash: ' + String(msg).split('\n')[0]);
}

process.on('uncaughtException', (err) => {
  crashLog('uncaughtException: ' + (err && err.stack ? err.stack : err));
});
process.on('unhandledRejection', (err) => {
  crashLog('unhandledRejection: ' + (err && err.stack ? err.stack : err));
});
app.on('child-process-gone', (_e, details) => {
  crashLog('child-process-gone: ' + JSON.stringify(details));
});
app.on('before-quit', () => logLine('app quitting'));

function startServer() {
  if (serverStarted) return;
  serverStarted = true;
  try {
    require('./server.js');
  } catch (err) {
    console.error('AEGIS server failed to start:', err);
  }
}

function waitForServer(retries = 60) {
  return new Promise((resolve) => {
    const tick = (left) => {
      const req = http.get(
        { host: '127.0.0.1', port: PORT, path: '/api/state', timeout: 800 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) resolve(true);
          else if (left > 0) setTimeout(() => tick(left - 1), 250);
          else resolve(false);
        }
      );
      req.on('error', () => (left > 0 ? setTimeout(() => tick(left - 1), 250) : resolve(false)));
      req.on('timeout', () => req.destroy());
    };
    tick(retries);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    show: true,
    backgroundColor: '#070510',
    title: 'AEGIS',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0714',
      symbolColor: '#cbb6f5',
      height: 42
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true
    }
  });

  win.loadURL(`http://127.0.0.1:${PORT}/`).catch((err) => logLine('loadURL failed: ' + err.message));

  win.once('ready-to-show', () => {
    if (win) win.show();
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logLine(`did-fail-load ${code} ${desc} ${url}`);
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    crashLog('render-process-gone ' + JSON.stringify(details));
  });

  win.on('unresponsive', () => crashLog('window unresponsive'));

  win.once('show', () => logLine('window shown'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) event.preventDefault();
  });

  win.on('closed', () => {
    win = null;
  });
}

function logLine(msg) {
  try {
    const file = path.join(app.getPath('userData'), 'launch.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

/* Auto-update from GitHub Releases (electron-updater).
   Silent in dev; in the packaged EXE it downloads in the background and
   asks once before installing. Any failure is logged, never fatal. */
function setupAutoUpdates() {
  if (!app.isPackaged) return;
  // Only the NSIS install can self-update (electron-builder writes app-update.yml
  // for nsis only; the portable build extracts to %TEMP% and runs from there).
  const portable = String(process.execPath || '').includes('\\Temp\\');
  if (portable) {
    logLine('update: skipped (portable build cannot self-update)');
    return;
  }
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => logLine('update: checking'));
    autoUpdater.on('update-available', (info) => logLine('update: available ' + (info && info.version)));
    autoUpdater.on('update-not-available', () => logLine('update: not available'));
    autoUpdater.on('update-downloaded', (info) => {
      logLine('update: downloaded ' + (info && info.version));
      const opts = {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        title: 'AEGIS update',
        message: 'A new version of AEGIS is ready.',
        detail: 'Restart now to apply it, or keep working — it will install on quit.'
      };
      const p = win ? dialog().showMessageBox(win, opts) : dialog().showMessageBox(opts);
      p.then((r) => {
        if (r.response === 0) {
          logLine('update: installing on restart');
          autoUpdater.quitAndInstall();
        }
      });
    });
    autoUpdater.on('error', (err) => logLine('update error: ' + String((err && err.message) || err).slice(0, 300)));
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => logLine('update check failed: ' + String((err && err.message) || err).slice(0, 200)));
    }, 8000);
  } catch (err) {
    logLine('updater init failed: ' + String((err && err.message) || err));
  }
}

function dialog() {
  return require('electron').dialog;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      Menu.setApplicationMenu(null);
      startServer();
      const ready = await waitForServer();
      logLine('server ready: ' + ready + ' port ' + PORT);
      if (!ready) {
        const { dialog } = require('electron');
        dialog.showErrorBox('AEGIS', `Local server did not start on port ${PORT}.`);
        app.quit();
        return;
      }
      createWindow();
      logLine('window created');
      setupAutoUpdates();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    } catch (err) {
      logLine('startup error: ' + (err && err.stack ? err.stack : err));
      const { dialog } = require('electron');
      dialog.showErrorBox('AEGIS failed to start', String((err && err.message) || err));
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
