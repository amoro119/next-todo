// main.js
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');
const treeKill = require('tree-kill');
const portfinder = require('portfinder');

let serverProcess;
let writeServerProcess; // 新增：用于跟踪 write-server 进程
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

// 新增函数：启动 write-server
function startWriteServer() {
  return new Promise((resolve, reject) => {
    portfinder.basePort = 3001; // `server.ts` 中的默认端口
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

      // 注意：在打包后的应用中，.env 文件可能不可用。
      // 这里的 DATABASE_URL 应该通过一种更健壮的方式来配置。
      // 对于本地开发，它会从你的 docker-compose.yml 获取。
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
            DATABASE_URL: DATABASE_URL, // 确保进程能获取数据库连接
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
        // 等待 server.ts 中的启动日志
        if (output.includes('is running on port')) {
          console.log(`[Write Server] Ready on port ${port}`);
          resolve(); // 解决 Promise 表示服务器已启动
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
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      nodeIntegrationInWorker: true,
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
    // 在生产模式下，同时启动两个服务器
    Promise.all([startNextServer(), startWriteServer()])
      .then(([nextServerUrl]) => {
        mainWindow.loadURL(nextServerUrl);
      })
      .catch((err) => {
        console.error("Failed to start production servers", err);
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
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:; connect-src 'self' http://localhost:*;"
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
  // 确保两个进程都被正确关闭
  if (serverProcess) {
    console.log(`[Electron] Killing Next server process with PID: ${serverProcess.pid}`);
    treeKill(serverProcess.pid, 'SIGKILL');
  }
  if (writeServerProcess) {
    console.log(`[Electron] Killing write-server process with PID: ${writeServerProcess.pid}`);
    treeKill(writeServerProcess.pid, 'SIGKILL');
  }
});