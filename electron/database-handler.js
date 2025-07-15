// electron/database-handler.js
const { app, ipcMain } = require('electron');
const { PGlite } = require('@electric-sql/pglite');
const path = require('path');
const fs = require('fs');

const migrationsPath = path.join(__dirname, '../db/migrations-client/index.js');
let migratePromise = import(migrationsPath).catch(err => {
  console.error(`[DB Handler] FATAL: Failed to load migrations from ${migrationsPath}`, err);
  return null;
});

let dbInstance = null;
let dbInitializationPromise = null;

/**
 * 获取或初始化数据库实例
 * @returns {Promise<PGlite>}
 */
async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  if (dbInitializationPromise) {
    return dbInitializationPromise;
  }

  dbInitializationPromise = (async () => {
    try {
      const dataDir = path.join(app.getPath('userData'), 'pglite-data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      console.log(`[DB Handler] Initializing PGlite in main process at: ${dataDir}`);
      
      const db = new PGlite(dataDir);
      await db.waitReady;
      console.log('[DB Handler] PGlite is ready.');

      const migrationModule = await migratePromise;
      if (migrationModule && migrationModule.migrate) {
        console.log('[DB Handler] Applying migrations...');
        await migrationModule.migrate(db);
        console.log('[DB Handler] Migrations applied successfully.');
      } else {
        console.error('[DB Handler] Migration function not loaded, skipping migrations.');
      }
      
      dbInstance = db;
      return db;
    } catch (error) {
      console.error('[DB Handler] Failed to initialize database:', error);
      dbInitializationPromise = null; // Reset promise on failure
      throw error;
    }
  })();

  return dbInitializationPromise;
}

/**
 * 设置所有数据库相关的 IPC 处理器
 * @param {Electron.BrowserWindow} win - 主窗口实例，用于将更新推送回渲染器
 */
function setupDatabaseHandlers(win) {
  // 单次查询
  ipcMain.handle('db:query', async (_event, sql, params) => {
    try {
      const db = await getDb();
      const results = await db.query(sql, params);
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      console.error('[IPC Error] db:query failed:', error);
      throw new Error(error.message);
    }
  });

  // 执行写操作并广播变更
  ipcMain.handle('db:write', async (_event, sql, params) => {
    try {
      const db = await getDb();
      await db.query(sql, params);
      
      // 操作成功后，向渲染进程广播一个“数据已变更”的事件
      // 渲染进程可以根据这个事件来重新同步或刷新数据
      win.webContents.send('db:changed', { sql, params });

      return { success: true };
    } catch (error) {
      console.error('[IPC Error] db:write failed:', error);
      return { success: false, error: error.message };
    }
  });
  
  // 执行事务并广播
  ipcMain.handle('db:transaction', async (_event, queries) => {
    try {
      const db = await getDb();
      await db.transaction(async (tx) => {
        for (const { sql, params } of queries) {
          await tx.query(sql, params);
        }
      });
      win.webContents.send('db:changed', { queries });
      return { success: true };
    } catch (error) {
      console.error('[IPC Error] db:transaction failed:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取数据库快照
  ipcMain.handle('db:dump', async () => {
    try {
      const db = await getDb();
      const dump = await db.dump();
      return dump;
    } catch (error) {
      console.error('[IPC Error] db:dump failed:', error);
      throw new Error(error.message);
    }
  });
}

module.exports = { setupDatabaseHandlers };