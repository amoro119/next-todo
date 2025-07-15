// main.js
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');
const treeKill = require('tree-kill');
const portfinder = require('portfinder');
const { setupDatabaseHandlers } = require('./electron/database-handler'); // 引入数据库处理器

let serverProcess;
let writeServerProcess; // 用于跟踪 write-server 进程
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

function startWriteServer() {
  return new Promise((resolve, reject) => {
    portfinder.basePort = 3001;
    portfinder.getPort((err, port) => {
      if (err) {
        return reject(err);
      }

      console.log(`[Write Server] Starting on port ${port}...`);
      
      const serverCwd = path.join(__dirname, 'dist-server');
      const serverPath = path.join(serverCwd, 'server.js');

      console.log(`[Write Server] server.js Path: ${serverPath}`);
      console.log(`[Write Server] CWD for fork: ${serverCwd}`);

      if (!fs.existsSync(serverPath)) {
        return reject(new Error(`FATAL: write-server (server.js) not found at: ${serverPath}`));
      }

      const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:54321/next_todo';

      writeServerProcess = fork(
        serverPath,
        [],
        {
          cwd: serverCwd,
          silent: true,
          env: {
            ...process.env,
            PORT: port.toString(),
            DATABASE_URL: DATABASE_URL,
            NODE_ENV: isDev ? 'development' : 'production'
          }
        }
      );

      if (!writeServerProcess) {
        return reject(new Error('Failed to fork write-server process.'));
      }

      writeServerProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Write Server STDOUT]:', output);
        if (output.includes('is running on port')) {
          console.log(`[Write Server] Ready on port ${port}`);
          resolve();
        }
      });

      writeServerProcess.stderr.on('data', (data) => {
        console.error('[Write Server STDERR]:', data.toString());
      });

      writeServerProcess.on('exit', (code) => {
        console.log(`[Write Server] Exited with code ${code}`);
        writeServerProcess = null;
      });

      writeServerProcess.on('error', (err) => {
        console.error('[Write Server] Error:', err);
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
        // **修复**: 在 script-src 中添加 'unsafe-inline'
        'Content-Security-Policy': [
          "default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:*;"
        ]
      }
    });
  });

  setupDatabaseHandlers();
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
  if (writeServerProcess) {
    console.log(`[Electron] Killing write-server process with PID: ${writeServerProcess.pid}`);
    treeKill(writeServerProcess.pid, 'SIGKILL');
  }
});