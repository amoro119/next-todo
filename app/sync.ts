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

// ... 文件其余部分保持不变 (initializeElectricSystemTables, cleanupOldSubscriptions, 等)
// ... 为了简洁，这里省略了未更改的代码，请保留你文件中的其余部分

// <--- 请确保将 getElectricToken, invalidateElectricToken 和 getCachedElectricToken 的旧实现从这个文件中删除 --->
// <--- 下面的 startBidirectionalSync, updateSyncStatus, useSyncStatus 等函数保持不变 --->


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

  for (const shapeDef of shapes) {
    const { name: shapeName, columns } = shapeDef;

    // 1. 创建 ShapeStream
    const stream = new ShapeStream({
      url: `${electricProxyUrl}/v1/shape`,
      params: {
        table: shapeName,
        columns: columns
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    // 2. 创建 Shape 对象
    const shape = new Shape(stream);
    // 3. 等待初始同步完成
    console.log('创建 ShapeStream...');
    console.log('shape',shape);
    console.log('等待 shape.rows...');
    // 检查本地表是否为空
    let shouldInitialUpsert = false;
    try {
      const res = await pg.query(`SELECT 1 FROM ${shapeName} LIMIT 1`);
      shouldInitialUpsert = res.rows.length === 0;
    } catch (e) {
      console.warn('本地表计数失败，默认进行初始upsert:', e);
      shouldInitialUpsert = true;
    }
    if (shouldInitialUpsert) {
      // 用抽象函数获取全量数据
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

    // 5. 监听 shape 数据变化，实时写入本地
    stream.subscribe(
      (messages) => {
        (async () => {
          // console.log(messages)
          for (const msg of messages) {
            // 处理控制消息
            if (msg.headers?.control === 'must-refetch') {
              console.warn(`[must-refetch] 收到 must-refetch 控制消息，需要全量同步！`);
              // 你可以在这里触发自动重启同步流或提示用户刷新页面
              // shouldInitialUpsert = true;
            }
            // 处理数据变更消息
            // console.log('msg', msg)
            // console.log('msg.headers', msg.headers)
            const msgLsn = msg.headers.global_last_seen_lsn;
            // if (typeof msgLsn !== 'string') continue;
            // setGlobalLastSeenLsn(shapeName, msgLsn);
            const lastSeenLsn = getGlobalLastSeenLsn(shapeName);
            console.log(shapeName,lastSeenLsn)
            if (lastSeenLsn !== msg.headers.global_last_seen_lsn) {
              console.warn(`lsn不一致，需要全量同步！`);
              // shouldInitialUpsert = true;
              // 处理完后，更新本地 global_last_seen_lsn
              if (typeof msgLsn === 'string') {
                setGlobalLastSeenLsn(shapeName, msgLsn);
              }
            }
            if (!('value' in msg && 'lsn' in msg.headers)) continue;
            const rowLsn = msg.headers.lsn;
            console.log('rowLsn',rowLsn)
            // 只有当本地lsn小于消息lsn时才处理
            if (rowLsn && compareLsn(String(rowLsn), String(msgLsn)) >= 0) continue;
            const row = msg.value;
            // console.log('row',row)
            const operation = msg.headers?.operation;
            if (!operation) continue;
            if (shapeName === 'lists') {
              if (operation === 'insert') {
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
              } else if (operation === 'update') {
                const updateFields = Object.keys(row).filter(key => key !== 'id');
                if (updateFields.length > 0) {
                  const setClause = updateFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
                  const values = [row.id, ...updateFields.map(key => row[key])];
                  await pg.query(
                    `UPDATE lists SET ${setClause} WHERE id = $1`,
                    values
                  );
                }
              } else if (operation === 'delete') {
                await pg.query(
                  `DELETE FROM lists WHERE id = $1`,
                  [row.id ?? null]
                );
              }
            } else if (shapeName === 'todos') {
              if (operation === 'insert') {
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
              } else if (operation === 'update') {
                const updateFields = Object.keys(row).filter(key => key !== 'id');
                if (updateFields.length > 0) {
                  const setClause = updateFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
                  const values = [row.id, ...updateFields.map(key => row[key])];
                  await pg.query(
                    `UPDATE todos SET ${setClause} WHERE id = $1`,
                    values
                  );
                }
              } else if (operation === 'delete') {
                await pg.query(
                  `DELETE FROM todos WHERE id = $1`,
                  [row.id ?? null]
                );
              }
            }
          }
          console.log(`🔄 ${shapeName} 实时变更已同步到本地`);
        })();
      },
      (error) => {
        console.error('Error in subscription:', error)
      }
    )
  }

  // 本地 select 校验
  for (const shapeDef of shapes) {
    const shapeName = shapeDef.name;
    try {
      const result = await pg.query(`SELECT COUNT(*) as count FROM ${shapeName}`);
      const count = (result.rows[0] as { count: string }).count;
      console.log(`📊 ${shapeName} 同步后记录数: ${count} 条`);
    } catch (error) {
      console.error(`❌ 验证 ${shapeName} 失败:`, error);
    }
  }

  if (!initialSyncDone) {
    initialSyncDone = true;
    updateSyncStatus('initial-sync', 'Creating indexes...');
    await postInitialSync(pg as unknown as PGlite);
    updateSyncStatus('done');
    console.log('✅ 双向同步完成，应用已准备就绪');
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