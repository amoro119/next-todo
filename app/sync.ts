// app/sync.ts
import { PGlite } from '@electric-sql/pglite'
import { PGliteWithLive } from '@electric-sql/pglite/live'
import { PGliteWithSync } from '@electric-sql/pglite-sync'
import { postInitialSync } from '../db/migrations-client'
import { useEffect, useState } from 'react'
import { ShapeStream, Shape } from '@electric-sql/client';
import { getAuthToken, getCachedAuthToken, invalidateToken } from '../lib/auth'; // <--- 导入新的认证模块

type SyncStatus = 'initial-sync' | 'done' | 'error'

type PGliteWithExtensions = PGliteWithLive & PGliteWithSync

// --- 认证逻辑现在已移至 lib/auth.ts ---

export async function startSync(pg: PGliteWithExtensions) {
  console.log('Starting ElectricSQL sync...')
  updateSyncStatus('initial-sync', 'Starting sync...')

  try {
    // 获取认证令牌
    console.log("正在获取同步认证令牌...");
    // 调用新的、健壮的令牌获取函数
    await getAuthToken();
    const token = getCachedAuthToken();

    if (!token) {
      throw new Error("认证失败：未能获取到有效的同步令牌。");
    }
    console.log("认证成功，令牌已缓存。");


    // 初始化ElectricSQL系统表
    console.log('Initializing ElectricSQL system tables...')
    await initializeElectricSystemTables(pg)

    // 检查本地是否首次同步（无数据时才清理订阅）
    const listsCountRes = await pg.query('SELECT COUNT(*) as count FROM lists');
    const todosCountRes = await pg.query('SELECT COUNT(*) as count FROM todos');
    const listsCount = Number((listsCountRes.rows[0] as { count: string | number })?.count || 0);
    const todosCount = Number((todosCountRes.rows[0] as { count: string | number })?.count || 0);
    if (listsCount === 0 && todosCount === 0) {
      // 仅首次同步时清理旧的同步订阅
      console.log('首次同步，清理旧的同步订阅...')
      await cleanupOldSubscriptions(pg)
    } else {
      console.log('本地已有数据，跳过订阅清理')
    }

    // 启动非破坏性的双向同步
    console.log('Starting non-destructive bidirectional sync...')
    await startBidirectionalSync(pg)
  } catch (error) {
    console.error('Sync failed:', error)
    // 当认证失败时，确保清除缓存的令牌
    invalidateToken();
    const errorMessage = error instanceof Error ? error.message : '同步失败，但应用仍可使用';
    if (errorMessage.includes('认证失败') || errorMessage.includes('认证令牌')) {
      updateSyncStatus('error', '认证失败，无法同步数据');
    } else {
      updateSyncStatus('error', '同步失败，但应用仍可使用');
    }
  }
}


async function initializeElectricSystemTables(pg: PGliteWithExtensions) {
  console.log('Waiting for ElectricSQL to initialize system tables...')

  // 等待一段时间让ElectricSQL初始化
  await new Promise(resolve => setTimeout(resolve, 2000))

  // 尝试创建一个简单的查询来触发ElectricSQL系统表初始化
  try {
    await pg.query('SELECT 1')
    console.log('ElectricSQL system tables should be initialized')
  } catch {
    console.log('ElectricSQL still initializing, continuing...')
  }

  // 再等待一段时间确保系统表创建完成
  await new Promise(resolve => setTimeout(resolve, 1000))
}

async function cleanupOldSubscriptions(pg: PGliteWithExtensions) {
  try {
    console.log('Cleaning up old sync subscriptions...')

    // 只清理旧的同步订阅，不清空数据
    try {
      await pg.sync.deleteSubscription('lists')
      await pg.sync.deleteSubscription('todos')
      await pg.sync.deleteSubscription('meta')
      console.log('Deleted old sync subscriptions')
    } catch (error) {
      console.log('No old subscriptions to delete or error:', error instanceof Error ? error.message : String(error))
    }

    // 等待一小段时间确保订阅删除完成
    await new Promise(resolve => setTimeout(resolve, 100))

    console.log('Old subscriptions cleanup completed')

  } catch (error) {
    console.log('Cleanup old subscriptions error:', error)
  }
}

// global_last_seen_lsn 本地缓存工具
function getGlobalLastSeenLsn(shapeName: string): string | undefined {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return undefined;
  try {
    return localStorage.getItem(`global_last_seen_lsn:${shapeName}` ) || undefined;
  } catch (e) {
    console.error(`[调试] 读取 global_last_seen_lsn:${shapeName} 失败:`, e);
    return undefined;
  }
}

function setGlobalLastSeenLsn(shapeName: string, lsn: string) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`global_last_seen_lsn:${shapeName}`, lsn);
  } catch (e) {
    console.error(`[调试] 写入 global_last_seen_lsn:${shapeName} 失败:`, e);
  }
}

/**
 * 获取某个表的全量数据（通过ShapeStream offset=-1）
 */
export async function getFullShapeRows({
  table,
  columns,
  electricProxyUrl,
  token
}: {
  table: string,
  columns: string[],
  electricProxyUrl: string,
  token: string
}): Promise<unknown[]> {
  const fullShapeStream = new ShapeStream({
    url: `${electricProxyUrl}/v1/shape`,
    params: {
      table,
      columns
    },
    offset: '-1',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const fullShape = new Shape(fullShapeStream);
  return await fullShape.rows;
}

/**
 * 拉取全量数据并写入本地数据库（核心实现）
 */
async function doFullTableSync({
  table,
  columns,
  electricProxyUrl,
  token,
  pg,
  upsertSql
}: {
  table: string,
  columns: string[],
  electricProxyUrl: string,
  token: string,
  pg: PGliteWithExtensions,
  upsertSql: string
}): Promise<void> {
  const rows = await getFullShapeRows({ table, columns, electricProxyUrl, token });
  for (const rowRaw of rows) {
    const row = rowRaw as Record<string, unknown>;
    if (table === 'lists') {
      await pg.query(
        `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT(id) DO UPDATE SET name = $2, sort_order = $3, is_hidden = $4, modified = $5`,
        [
          row.id ?? null,
          row.name ?? null,
          row.sort_order ?? 0,
          row.is_hidden ?? false,
          row.modified ?? null
        ]
      );
    } else if (table === 'todos') {
      await pg.query(
        `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT(id) DO UPDATE SET title=$2, completed=$3, deleted=$4, sort_order=$5, due_date=$6, content=$7, tags=$8, priority=$9, created_time=$10, completed_time=$11, start_date=$12, list_id=$13`,
        [
          row.id ?? null,
          row.title ?? null,
          row.completed ?? false,
          row.deleted ?? false,
          row.sort_order ?? 0,
          row.due_date ?? null,
          row.content ?? null,
          row.tags ?? null,
          row.priority ?? 0,
          row.created_time ?? null,
          row.completed_time ?? null,
          row.start_date ?? null,
          row.list_id ?? null
        ]
      );
    } else {
      // 通用写入逻辑
      const values = columns.map(col => row[col] ?? null);
      await pg.query(upsertSql, values);
    }
  }
  console.log(`📥 ${table} 全量同步完成，已写入本地`);
}

/**
 * 拉取全量数据并写入本地数据库（仅本地表为空时）
 */
export async function syncFullTableToLocal({
  table,
  columns,
  electricProxyUrl,
  token,
  pg,
  upsertSql
}: {
  table: string,
  columns: string[],
  electricProxyUrl: string,
  token: string,
  pg: PGliteWithExtensions,
  upsertSql: string
}): Promise<void> {
  // 检查本地表是否为空，若查询失败则默认需要初始upsert
  let shouldInitialUpsert = false;
  try {
    const res = await pg.query(`SELECT 1 FROM ${table} LIMIT 1`);
    shouldInitialUpsert = res.rows.length === 0;
  } catch (e) {
    console.warn('本地表计数失败，默认进行初始upsert:', e);
    shouldInitialUpsert = true;
  }
  if (!shouldInitialUpsert) {
    console.log(`📥 本地${table}表已有数据，跳过初始全量写入`);
    return;
  }
  await doFullTableSync({ table, columns, electricProxyUrl, token, pg, upsertSql });
}

/**
 * 强制拉取全量数据并写入本地数据库（无论本地表是否为空）
 */
export async function forceFullTableSync({
  table,
  columns,
  electricProxyUrl,
  token,
  pg,
  upsertSql
}: {
  table: string,
  columns: string[],
  electricProxyUrl: string,
  token: string,
  pg: PGliteWithExtensions,
  upsertSql: string
  }): Promise<void> {
  updateSyncStatus('initial-sync', 'Starting sync...')
  await doFullTableSync({ table, columns, electricProxyUrl, token, pg, upsertSql });
  updateSyncStatus('done');
}

async function startBidirectionalSync(pg: PGliteWithExtensions) {
  const shapes = [
    {
      name: 'lists',
      columns: ['id', 'name', 'sort_order', 'is_hidden', 'modified']
    },
    {
      name: 'todos',
      columns: ['id', 'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id']
    }
  ];
  
  const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
  if (!electricProxyUrl) {
    throw new Error("NEXT_PUBLIC_ELECTRIC_PROXY_URL is not set.");
  }
  
  const token = getCachedAuthToken();
  if (!token) {
    throw new Error("Authentication token is not available for sync.");
  }

  // 1. 先做初始同步
  for (const shapeDef of shapes) {
    const { name: shapeName, columns } = shapeDef;
    let shouldInitialUpsert = false;
    try {
      const res = await pg.query(`SELECT 1 FROM ${shapeName} LIMIT 1`);
      shouldInitialUpsert = res.rows.length === 0;
    } catch (e) {
      console.warn('本地表计数失败，默认进行初始upsert:', e);
      shouldInitialUpsert = true;
    }
    
    if (shouldInitialUpsert) {
      const rows = await getFullShapeRows({
        table: shapeName,
        columns,
        electricProxyUrl,
        token: token!
      });
      
      for (const rowRaw of rows) {
        const row = rowRaw as Record<string, unknown>;
        if (shapeName === 'lists') {
          await pg.query(
            `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT(id) DO UPDATE SET name = $2, sort_order = $3, is_hidden = $4, modified = $5`,
            [
              row.id ?? null,
              row.name ?? null,
              row.sort_order ?? 0,
              row.is_hidden ?? false,
              row.modified ?? null
            ]
          );
        } else if (shapeName === 'todos') {
          await pg.query(
            `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
              ON CONFLICT(id) DO UPDATE SET title=$2, completed=$3, deleted=$4, sort_order=$5, due_date=$6, content=$7, tags=$8, priority=$9, created_time=$10, completed_time=$11, start_date=$12, list_id=$13`,
            [
              row.id ?? null,
              row.title ?? null,
              row.completed ?? false,
              row.deleted ?? false,
              row.sort_order ?? 0,
              row.due_date ?? null,
              row.content ?? null,
              row.tags ?? null,
              row.priority ?? 0,
              row.created_time ?? null,
              row.completed_time ?? null,
              row.start_date ?? null,
              row.list_id ?? null
            ]
          );
        }
      }
      console.log(`📥 ${shapeName} 初始同步完成，已写入本地`);
    } else {
      console.log(`📥 本地${shapeName}表已有数据，跳过初始全量写入`);
    }
  }

  // 2. 只在初始同步完成后执行一次校验（带补偿）
  for (const shapeDef of shapes) {
    const { name: shapeName, columns } = shapeDef;

    /* ---------- 远程行数 ---------- */
    const remoteRows = await getFullShapeRows({
      table: shapeName,
      columns,
      electricProxyUrl,
      token: token!
    });
    const remoteCount = remoteRows.length;

    /* ---------- 本地行数 ---------- */
    let localCount = 0;
    try {
      const res = await pg.query(`SELECT COUNT(*)::int AS count FROM ${shapeName}`);
      localCount = res.rows[0]?.count ?? 0;
    } catch {
      localCount = 0;
    }

    console.log(
      `📊 ${shapeName} 校验 -> 远程:${remoteCount} 本地:${localCount}`
    );

    /* ---------- 不一致时补偿 ---------- */
    if (localCount !== remoteCount) {
      console.warn(
        `⚠️ ${shapeName} 行数不一致，准备强制全量同步...`
      );

      // 根据表名生成 upsert SQL
      const upsertSql =
        shapeName === 'lists'
          ? `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT(id) DO UPDATE SET name=$2, sort_order=$3, is_hidden=$4, modified=$5`
          : `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags,
                              priority, created_time, completed_time, start_date, list_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT(id) DO UPDATE SET title=$2, completed=$3, deleted=$4, sort_order=$5,
                                          due_date=$6, content=$7, tags=$8, priority=$9,
                                          created_time=$10, completed_time=$11,
                                          start_date=$12, list_id=$13`;

      await forceFullTableSync({
        table: shapeName,
        columns,
        electricProxyUrl,
        token,
        pg,
        upsertSql
      });

      /* 再次校验 */
      try {
        const finalRes = await pg.query(
          `SELECT COUNT(*)::int AS count FROM ${shapeName}`
        );
        console.log(
          `✅ ${shapeName} 补偿后本地记录数: ${finalRes.rows[0]?.count}`
        );
      } catch (e) {
        console.error(`❌ ${shapeName} 补偿后校验失败:`, e);
      }
    } else {
      console.log(`✅ ${shapeName} 行数一致，无需补偿`);
    }
  }

  // 3. 标记初始同步完成
  if (!initialSyncDone) {
    initialSyncDone = true;
    updateSyncStatus('initial-sync', 'Creating indexes...');
    await postInitialSync(pg as unknown as PGlite);
    updateSyncStatus('done');
    console.log('✅ 初始同步完成，准备开始实时同步...');
  }

  // 4. 创建 ShapeStream 但不立即订阅
  const streams = shapes.map(shapeDef => {
    return {
      shapeName: shapeDef.name,
      columns: shapeDef.columns,
      stream: new ShapeStream({
        url: `${electricProxyUrl}/v1/shape`,
        params: {
          table: shapeDef.name,
          columns: shapeDef.columns
        },
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
    };
  });

  // 5. 在 initialSyncDone 后订阅变动
  function subscribeShapeStream(shapeName: string, columns: string[], stream: ShapeStream) {
    let lastMessageTime = Date.now();
    let timeoutChecker: ReturnType<typeof setInterval> | null = null;
    
    const TIMEOUT_MS = 60000;
    
    const setupSubscription = () => {
      if (timeoutChecker) clearInterval(timeoutChecker);
      
      lastMessageTime = Date.now();
      timeoutChecker = setInterval(() => {
        if (Date.now() - lastMessageTime > TIMEOUT_MS) {
          console.warn(`ShapeStream ${shapeName} 超时无消息，自动重连...`);
          clearInterval(timeoutChecker!);
          setupSubscription();
        }
      }, 10000);

      stream.subscribe(
        (messages) => {
          (async () => {
            if (!messages || messages.length === 0) {
              console.warn(`${shapeName} 未收到消息，尝试重连 ShapeStream...`);
              setTimeout(setupSubscription, 1000);
              return;
            }
            
            lastMessageTime = Date.now();
            
            for (const msg of messages) {
              // 处理消息的逻辑...
              if (msg.headers?.control === 'must-refetch') {
                console.warn(`[must-refetch] ${shapeName} 收到 must-refetch 控制消息，需要全量同步！`);
              }
              
              const msgLsn = msg.headers.global_last_seen_lsn;
              const lastSeenLsn = getGlobalLastSeenLsn(shapeName);
              if (lastSeenLsn !== msg.headers.global_last_seen_lsn) {
                if (typeof msgLsn === 'string') {
                  setGlobalLastSeenLsn(shapeName, msgLsn);
                }
              }
              
              if (!('value' in msg && 'lsn' in msg.headers)) continue;
              
              const rowLsn = msg.headers.lsn;
              if (rowLsn && compareLsn(String(rowLsn), String(msgLsn)) >= 0) continue;
              
              const row = msg.value;
              const operation = msg.headers?.operation;
              if (!operation) continue;
              
              // 处理 insert/update/delete 操作...
              await processShapeChange(shapeName, operation, row, pg);
            }
            
            console.log(`🔄 ${shapeName} 实时变更已同步到本地`);
          })();
        },
        (error) => {
          console.error(`${shapeName} subscription error:`, error);
          setTimeout(setupSubscription, 1000);
        }
      );
    };
    
    setupSubscription();
  }

  // 6. 为每个 stream 设置订阅
  streams.forEach(({ shapeName, columns, stream }) => {
    subscribeShapeStream(shapeName, columns, stream);
  });
}

// 将处理 shape 变更的逻辑提取为独立函数
async function processShapeChange(
  shapeName: string,
  operation: string,
  row: Record<string, unknown>,
  pg: PGliteWithExtensions
) {
  if (shapeName === 'lists') {
    switch (operation) {
      case 'insert':
        await pg.query(
          `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(id) DO UPDATE SET name = $2, sort_order = $3, is_hidden = $4, modified = $5`,
          [
            row.id ?? null,
            row.name ?? null,
            row.sort_order ?? 0,
            row.is_hidden ?? false,
            row.modified ?? null
          ]
        );
        break;
        
      case 'update':
        const updateFields = Object.keys(row).filter(key => key !== 'id');
        if (updateFields.length > 0) {
          const setClause = updateFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
          const values = [row.id, ...updateFields.map(key => row[key])];
          await pg.query(
            `UPDATE lists SET ${setClause} WHERE id = $1`,
            values
          );
        }
        break;
        
      case 'delete':
        await pg.query(
          `DELETE FROM lists WHERE id = $1`,
          [row.id ?? null]
        );
        break;
    }
  } else if (shapeName === 'todos') {
    switch (operation) {
      case 'insert':
        await pg.query(
          `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT(id) DO UPDATE SET title=$2, completed=$3, deleted=$4, sort_order=$5, due_date=$6, content=$7, tags=$8, priority=$9, created_time=$10, completed_time=$11, start_date=$12, list_id=$13`,
          [
            row.id ?? null,
            row.title ?? null,
            row.completed ?? false,
            row.deleted ?? false,
            row.sort_order ?? 0,
            row.due_date ?? null,
            row.content ?? null,
            row.tags ?? null,
            row.priority ?? 0,
            row.created_time ?? null,
            row.completed_time ?? null,
            row.start_date ?? null,
            row.list_id ?? null
          ]
        );
        break;
        
      case 'update':
        const updateFields = Object.keys(row).filter(key => key !== 'id');
        if (updateFields.length > 0) {
          const setClause = updateFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
          const values = [row.id, ...updateFields.map(key => row[key])];
          await pg.query(
            `UPDATE todos SET ${setClause} WHERE id = $1`,
            values
          );
        }
        break;
        
      case 'delete':
        await pg.query(
          `DELETE FROM todos WHERE id = $1`,
          [row.id ?? null]
        );
        break;
    }
  }
}

export function updateSyncStatus(newStatus: SyncStatus, message?: string) {
  // Guard against SSR
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  console.log(`Sync status: ${newStatus} - ${message || ''}`)
  localStorage.setItem('syncStatus', JSON.stringify([newStatus, message]))
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'syncStatus',
      newValue: JSON.stringify([newStatus, message]),
    })
  )
}

export function useSyncStatus(): [SyncStatus, string | undefined] {
  const [syncStatus, setSyncStatus] = useState<[SyncStatus, string | undefined]>(['initial-sync', 'Starting sync...']);

  useEffect(() => {
    const getStatus = (): [SyncStatus, string | undefined] => {
      // This will only run on the client, where localStorage is available.
      const currentSyncStatusJson = localStorage.getItem('syncStatus');
      return currentSyncStatusJson ? JSON.parse(currentSyncStatusJson) : ['initial-sync', 'Starting sync...'];
    };

    setSyncStatus(getStatus());

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'syncStatus' && e.newValue) {
        setSyncStatus(JSON.parse(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return syncStatus;
}

let initialSyncDone = false;
export function waitForInitialSyncDone() {
  return new Promise<void>((resolve) => {
    if (initialSyncDone) {
      resolve();
      return;
    }
    // Guard against SSR
    if (typeof window === 'undefined') {
      return;
    }
    const checkStatus = () => {
        const currentSyncStatusJson = localStorage.getItem('syncStatus');
        const [currentStatus] = currentSyncStatusJson ? JSON.parse(currentSyncStatusJson) : ['initial-sync'];
        if (currentStatus === 'done') {
            initialSyncDone = true;
            resolve();
            return true;
        }
        return false;
    };
    if (checkStatus()) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'syncStatus' && e.newValue) {
        if (checkStatus()) {
          window.removeEventListener('storage', handleStorageChange);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
  });
}

// lsn 字符串比较工具（假设 lsn 是字符串，可以直接比较；如有特殊格式可扩展）
function compareLsn(a: string, b: string): number {
  // 兼容 pg lsn 格式如 '0/16B6C50'，先按长度再按字典序
  if (a === b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : 1;
}