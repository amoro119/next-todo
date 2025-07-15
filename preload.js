// preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ Preload script loaded. Setting up context bridge.');

// 在主世界（渲染进程的window对象）中暴露一个名为'electron'的对象
contextBridge.exposeInMainWorld('electron', {
  db: {
    /**
     * 执行一个带参数的SQL查询，并返回结果。
     * @param {string} sql - SQL查询语句 (例如, "SELECT * FROM todos WHERE id = $1")
     * @param {Array<any>} [params] - 查询参数数组
     * @returns {Promise<QueryResult>}
     */
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),

    /**
     * 执行一个或多个不返回结果的SQL命令。
     * @param {string} sql - 一个或多个SQL命令
     * @returns {Promise<QueryResult[]>}
     */
    exec: (sql) => ipcRenderer.invoke('db:exec', sql),

    /**
     * 在一个事务中执行多个查询。
     * @param {Array<{sql: string, params: Array<any>}>} queries - 要在事务中执行的查询数组
     * @returns {Promise<QueryResult[]>}
     */
    transaction: (queries) => ipcRenderer.invoke('db:transaction', queries),
  },
  // 如果未来需要其他主进程功能，可以在这里添加
  // 例如:
  // fs: {
  //   readFile: (path) => ipcRenderer.invoke('fs:readFile', path)
  // }
});