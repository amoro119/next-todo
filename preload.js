/* eslint-disable */
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

    // 统一的写接口，兼容前端 DatabaseAPI 期望
    insert: (table, data) => {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
      return ipcRenderer.invoke('db:write', sql, values);
    },
    update: (table, id, data) => {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const sql = `UPDATE ${table} SET ${setClause} WHERE id = $1`;
      return ipcRenderer.invoke('db:write', sql, [id, ...values]);
    },
    delete: (table, id) => {
      const sql = `DELETE FROM ${table} WHERE id = $1`;
      return ipcRenderer.invoke('db:write', sql, [id]);
    },
    rawWrite: (sql, params) => ipcRenderer.invoke('db:write', sql, params),
    
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