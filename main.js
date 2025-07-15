// main.js
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');
const treeKill = require('tree-kill');
const portfinder = require('portfinder');
const { setupDatabaseHandlers } = require('./electron/database-handler');

let serverProcess;
let writeServerProcess;
let mainWindow;

const isDev = !app.isPackaged;

function startNextServer() {
  return new Promise((resolve, reject) => {
    portfinder.basePort = isDev ? 3000 : 8000;
    portfinder.getPort((err, port) => {
      if (err) {
        return reject(err);
      }
      
      console.log(`[Next Server] Starting on port ${port}...`);
      
      const serverCwd = __dirname;
      const standaloneCwd = path.join(serverCwd, '.next', 'standalone');
      const serverPath = path.join(standaloneCwd, 'server.js');

      console.log(`[Next Server] server.js Path: ${serverPath}`);
      console.log(`[Next Server] CWD for fork: ${standaloneCwd}`);

      if (!fs.existsSync(serverPath)) {
        return reject(new Error(`FATAL: server.js not found at: ${serverPath}`));
      }

      serverProcess = fork(
        serverPath,
        ['-p', port.toString()],
        {
          cwd: standaloneCwd,
          silent: true,
          env: {
            ...process.env,
            PORT: port.toString(),
            NODE_ENV: isDev ? 'development' : 'production'
          }
        }
      );

      if (!serverProcess) {
        return reject(new Error('Failed to fork server process.'));
      }
      
      const serverUrl = `http://localhost:${port}`;
      
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Next Server STDOUT]:', output);
        if (output.includes('ready') || output.includes('- Local:')) {
          console.log(`[Next Server] Ready at ${serverUrl}`);
          resolve(serverUrl);
        }
      });
      
      serverProcess.stderr.on('data', (data) => {
        console.error('[Next Server STDERR]:', data.toString());
      });
      
      serverProcess.on('exit', (code) => {
        console.log(`[Next Server] Exited with code ${code}`);
        serverProcess = null;
      });

      serverProcess.on('error', (err) => {
        console.error('[Next Server] Error:', err);
        reject(err);
      });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'public', 'favicon.png'),
    show: false,
  });

  setupDatabaseHandlers(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const startUrl = isDev ? 'http://localhost:3000' : 'about:blank';
  
  if (isDev) {
    mainWindow.loadURL(startUrl);
    mainWindow.webContents.openDevTools();
  } else {
    startNextServer()
      .then((nextServerUrl) => {
        mainWindow.loadURL(nextServerUrl);
      })
      .catch((err) => {
        console.error("Failed to start production server", err);
        app.quit();
      });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        // **修复**: 在 connect-src 中添加 Supabase 域名
        'Content-Security-Policy': [
          "default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:* https://uurjvmztzzresuplaiuw.supabase.co;"
        ]
      }
    });
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    console.log(`[Electron] Killing Next server process with PID: ${serverProcess.pid}`);
    treeKill(serverProcess.pid, 'SIGKILL');
  }
  // 不再需要管理 writeServerProcess
});