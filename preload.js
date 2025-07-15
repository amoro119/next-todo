// preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ Preload script loaded. Setting up context bridge for DB sync.');

contextBridge.exposeInMainWorld('electron', {
  db: {
    // 只读操作
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    dump: () => ipcRenderer.invoke('db:dump'),

    // 写操作
    write: (sql, params) => ipcRenderer.invoke('db:write', sql, params),
    transaction: (queries) => ipcRenderer.invoke('db:transaction', queries),
    
    // 监听来自主进程的变更通知
    onChange: (callback) => {
      const channel = 'db:changed';
      // 使用箭头函数确保 'this' 上下文正确
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      // 返回一个取消订阅的函数，以便在组件卸载时清理
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  }
});