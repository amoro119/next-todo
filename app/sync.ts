// app/sync.ts
import { PGlite } from '@electric-sql/pglite'
import { PGliteWithLive } from '@electric-sql/pglite/live'
import { PGliteWithSync } from '@electric-sql/pglite-sync'
import { postInitialSync } from '../db/migrations-client'
import { useEffect, useState } from 'react'

type SyncStatus = 'initial-sync' | 'done' | 'error'

type PGliteWithExtensions = PGliteWithLive & PGliteWithSync

// --- 认证逻辑 ---
let cachedElectricToken: string | null = null;

export function invalidateElectricToken() {
  console.log("Invalidating cached Electric token.");
  cachedElectricToken = null;
}

async function getElectricToken(): Promise<string> {
  if (cachedElectricToken) {
    return cachedElectricToken;
  }

  try {
    console.log("Fetching new ElectricSQL auth token from token-issuer function...");
    
    const tokenIssuerUrl = process.env.NEXT_PUBLIC_TOKEN_ISSUER_URL;
    if (!tokenIssuerUrl) {
      throw new Error("NEXT_PUBLIC_TOKEN_ISSUER_URL is not set.");
    }

    const response = await fetch(tokenIssuerUrl);
    if (!response.ok) {
      throw new Error(`获取Electric令牌失败: ${response.status} ${response.statusText}`);
    }
    const { token } = await response.json();
    if (!token) {
      throw new Error('在响应中未找到令牌');
    }
    cachedElectricToken = token;
    return token;
  } catch (error) {
    console.error("获取Electric令牌时发生严重错误:", error);
    invalidateElectricToken();
    throw new Error(`无法获取认证令牌: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function startSync(pg: PGliteWithExtensions) {
  console.log('Starting ElectricSQL sync...')
  updateSyncStatus('initial-sync', 'Starting sync...')
  
  try {
    // 获取认证令牌
    console.log("正在获取同步认证令牌...");
    await getElectricToken(); 
    if (!cachedElectricToken) {
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

async function startBidirectionalSync(pg: PGliteWithExtensions) {
  const MAX_RETRIES = 3
  
  // 需要同步的表
  const shapes = ['lists', 'todos']
  
  console.log('Starting bidirectional sync for shapes:', shapes)
  
  // 检查并获取必要的环境变量
  const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
  if (!electricProxyUrl) {
    throw new Error("NEXT_PUBLIC_ELECTRIC_PROXY_URL is not set.");
  }
  if (!cachedElectricToken) {
    throw new Error("Authentication token is not available for sync.");
  }

  // 1. 仅首次启动/本地无数据时 shape 全量拉取
  for (const shapeName of shapes) {
    try {
      console.log('准备检查本地表是否有数据，pg 实例：', pg, '表名：', shapeName);
      // 检查本地表是否有数据
      const result = await pg.query(`SELECT COUNT(*) as count FROM ${shapeName}`);
      const countRaw = (result.rows[0] as Record<string, unknown>)?.count;
      const count = typeof countRaw === 'string' ? parseInt(countRaw, 10) : Number(countRaw);
      console.log(`本地 ${shapeName} count:`, count, 'rows:', result.rows);
      if (count === 0) {
        // 仅首次 shape 拉取
        const columns = shapeName === 'lists'
          ? ['id', 'name', 'sort_order', 'is_hidden', 'modified']
          : ['id', 'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id'];
        let offset = 0;
        const limit = 999;
        while (true) {
          const shapeUrl = `${electricProxyUrl}/v1/shape?table=${shapeName}&columns=${columns.join(',')}&offset=${offset}&limit=${limit}`;
          const resp = await fetch(shapeUrl, {
            headers: { 'Authorization': `Bearer ${cachedElectricToken}` }
          });
          if (!resp.ok) throw new Error(`拉取${shapeName} shape失败: ${resp.status}`);
          const { rows, hasMore } = await resp.json();
          if (Array.isArray(rows) && rows.length > 0) {
            for (const row of rows) {
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
            if (!hasMore || rows.length < limit) break;
            offset += limit;
          } else {
            break;
          }
        }
        console.log(`首次初始化 ${shapeName}，已拉取并写入本地`);
      } else {
        console.log(`${shapeName} 本地已有数据，跳过 shape 拉取`);
      }
    } catch (err) {
      console.error(`同步${shapeName} shape数据失败:`, err);
    }
  }

  // 2. 始终执行 ElectricSQL sync 机制
  const syncPromises = shapes.map(async (shapeName) => {
    console.log(`🔄 开始双向同步 ${shapeName}...`);
    let retryCount = 0;
    let success = false;
    while (retryCount < MAX_RETRIES && !success) {
      try {
        console.log(`📥 尝试同步 ${shapeName} (尝试 ${retryCount + 1}/${MAX_RETRIES})...`);
        const syncConfig = {
          shape: {
            url: `${electricProxyUrl}/v1/shape`,
            params: {
              table: shapeName,
              columns: shapeName === 'lists'
                ? ['id', 'name', 'sort_order', 'is_hidden', 'modified']
                : ['id', 'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id']
            },
            headers: {
              'Authorization': `Bearer ${cachedElectricToken}`
            }
          },
          table: shapeName,
          primaryKey: ['id'],
          shapeKey: shapeName
        };
        await pg.sync.syncShapeToTable(syncConfig);
        console.log(`✅ ${shapeName} ElectricSQL 双向同步启动成功`);
        success = true;
      } catch (error) {
        console.error(`❌ ${shapeName} 同步错误 (尝试 ${retryCount + 1}):`, error);
        if (retryCount < MAX_RETRIES - 1) {
          retryCount++;
          const delay = 1000 * retryCount;
          console.log(`⏳ ${delay}ms 后重试 ${shapeName}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw new Error(`同步 ${shapeName} 失败，已重试 ${MAX_RETRIES} 次: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  });

  // 等待所有表的同步启动完成
  await Promise.all(syncPromises);

  console.log('🎉 所有双向同步启动完成！');
  
  // 等待一段时间让初始同步完成
  console.log('⏳ 等待初始同步完成...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 验证同步状态
  for (const shapeName of shapes) {
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