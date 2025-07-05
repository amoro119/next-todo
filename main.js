// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const treeKill = require('tree-kill');

// --- 全局变量 ---
let nextServerProcess;
let mainWindow;
let serverUrl; // 保存服务器的 URL

const DEV_PORT = 3000;
const DEV_URL = `http://localhost:${DEV_PORT}`;

/**
 * 启动 Next.js 服务器子进程
 * @returns {Promise<string>} 返回服务器监听的 URL
 */
function startNextServer() {
    // 如果服务器已在运行，则直接返回
    if (nextServerProcess && !nextServerProcess.killed) {
        console.log('Next.js server is already running.');
        return Promise.resolve(serverUrl);
    }
    
    return new Promise((resolve, reject) => {
        const serverPath = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
        const args = ['dev', '-p', DEV_PORT];

        nextServerProcess = fork(serverPath, args, { silent: true });

        serverUrl = DEV_URL;

        nextServerProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('[Next.js Dev Server]:', output);
            if (output.includes('ready') || output.includes('started server on')) {
                console.log(`Next.js server is ready at ${serverUrl}`);
                resolve(serverUrl);
            }
        });
        nextServerProcess.stderr.on('data', (data) => console.error('[Next.js Dev Server stderr]:', data.toString()));
        nextServerProcess.on('exit', (code) => console.log(`Next.js server process exited with code ${code}`));
        nextServerProcess.on('error', (error) => reject(error));
    });
}

/**
 * 杀死服务器进程
 */
function killServerProcess() {
    if (nextServerProcess && !nextServerProcess.killed) {
        console.log(`Killing Next.js server process with PID: ${nextServerProcess.pid}`);
        treeKill(nextServerProcess.pid, 'SIGKILL');
        nextServerProcess = null;
        serverUrl = null;
    }
}

async function createWindow() {
    if (mainWindow) {
        mainWindow.focus();
        return;
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    try {
        const loadUrl = await startNextServer();
        console.log(`Loading URL: ${loadUrl}`);
        await mainWindow.loadURL(loadUrl);

    } catch (error) {
        console.error('Failed to create window or start server:', error);
    }

    mainWindow.on('closed', () => {
        console.log('Main window closed.');
        mainWindow = null;
    });
}

// --- 应用生命周期事件 ---

app.on('ready', () => {
    createWindow();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    console.log('Application is quitting. Final cleanup...');
    killServerProcess();
});