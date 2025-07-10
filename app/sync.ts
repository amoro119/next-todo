// app/sync.ts
import { PGlite } from '@electric-sql/pglite'
import { PGliteWithLive } from '@electric-sql/pglite/live'
import { PGliteWithSync } from '@electric-sql/pglite-sync'
import { postInitialSync } from '../db/migrations-client'
import { useEffect, useState } from 'react'
import { ShapeStreamOptions } from "@electric-sql/client"

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
    
    // **已修改**: 指向新的、专门的令牌颁发函数URL
    // 您需要在.env.local中设置这个新变量
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
    // --- 修改开始 ---
    // 增强错误处理，确保错误能被上层捕获
    console.error("获取Electric令牌时发生严重错误:", error);
    invalidateElectricToken(); // 获取失败时，清空可能存在的无效缓存
    // 向上抛出错误，以便调用者（如 startSync）可以捕获它
    throw new Error(`无法获取认证令牌: ${error instanceof Error ? error.message : String(error)}`);
    // --- 修改结束 ---
  }
}

export async function startSync(pg: PGliteWithExtensions) {
  console.log('Starting ElectricSQL sync...')
  updateSyncStatus('initial-sync', 'Starting sync...')
  
  try {
    // --- 修改开始 ---
    // **核心修复**: 在开始同步前，先调用函数获取并缓存认证令牌。
    console.log("正在获取同步认证令牌...");
    await getElectricToken(); 
    // 防御性检查，确保 getElectricToken 成功设置了缓存
    if (!cachedElectricToken) {
      throw new Error("认证失败：未能获取到有效的同步令牌。");
    }
    console.log("认证成功，令牌已缓存。");
    // --- 修改结束 ---

    // 首先初始化ElectricSQL系统表
    console.log('Initializing ElectricSQL system tables...')
    await initializeElectricSystemTables(pg)
    
    // 重新启用清理过程
    console.log('Re-enabling cleanup process...')
    await cleanupSyncState(pg)
    
    // 使用简化的同步方法
    await startSimpleSync(pg)
  } catch (error) {
    console.error('Sync failed:', error)
    // 根据错误类型提供更具体的用户反馈
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

async function startSimpleSync(pg: PGliteWithExtensions) {
  console.log('Starting simple sync...')
  
  try {
    // 重新启用实际的同步功能
    console.log('Re-enabling server sync...')
    await startSyncToDatabase(pg)
    console.log('Server sync completed - application ready')
  } catch (error) {
    console.error('Simple sync error:', error)
    updateSyncStatus('error', '同步失败，但应用仍可使用')
  }
}

// =====================================================================
// 重点修改：重写 startSyncToDatabase 函数以确保 onInitialSync 正确执行
// =====================================================================
async function startSyncToDatabase(pg: PGliteWithExtensions) {
  const MAX_RETRIES = 3;
  const shapes = ['lists', 'todos'];
  console.log('Starting sync for shapes:', shapes);

  try {
    // 检查并获取必要的环境变量
    const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
    if (!electricProxyUrl) {
      throw new Error("NEXT_PUBLIC_ELECTRIC_PROXY_URL is not set.");
    }
    if (!cachedElectricToken) {
      throw new Error("Authentication token is not available for sync.");
    }

    // 为每个 shape 定义一个带重试逻辑的同步函数
    const syncShape = async (shapeName: string): Promise<void> => {
      let lastError: any = null;
      for (let i = 0; i < MAX_RETRIES; i++) {
        try {
          console.log(`Attempting to sync ${shapeName} (attempt ${i + 1}/${MAX_RETRIES})...`);

          const shapeOptions = {
            shape: {
              url: new URL(`${electricProxyUrl}/v1/shape`).toString(),
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
            shapeKey: shapeName,
            onInitialSync: () => {
              // 这个回调函数现在应该可以被正确触发了
              console.log(`✅ onInitialSync fired for ${shapeName}.`);
            },
            onMustRefetch: async (tx) => {
              console.warn(`Must refetch for ${shapeName}, clearing table and retrying...`);
              await tx.query(`DELETE FROM ${shapeName}`);
              throw new Error(`Must refetch for ${shapeName}`);
            }
          };

          const subscription = await pg.sync.syncShapeToTable(shapeOptions);
          
          // **核心修复**：等待 subscription.synced promise，它在初始数据同步完成后 resolve
          await subscription.synced;

          console.log(`🎉 Successfully synced initial data for ${shapeName}.`);
          return; // 同步成功，退出此 shape 的重试循环
        } catch (error) {
          lastError = error;
          console.error(`Error syncing ${shapeName} on attempt ${i + 1}:`, error);
          if (i < MAX_RETRIES - 1) {
            const delay = 1000 * (i + 1); // 简单的指数退避
            console.log(`Retrying sync for ${shapeName} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      // 如果所有重试都失败了，则抛出最后的错误
      throw new Error(`Failed to sync shape ${shapeName} after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || lastError}`);
    };

    // 并行启动所有 shape 的同步
    const allSyncPromises = shapes.map(syncShape);

    updateSyncStatus('initial-sync', `Syncing ${shapes.length} data shapes...`);
    
    // 等待所有 shape 的同步完成
    await Promise.all(allSyncPromises);

    console.log('All shapes have completed their initial sync.');

    // **修复竞态条件**：只有在所有 shape 同步完成后才执行此逻辑
    if (!initialSyncDone) {
      initialSyncDone = true;
      updateSyncStatus('initial-sync', 'Finalizing local database...');
      await postInitialSync(pg as unknown as PGlite);
      updateSyncStatus('done', 'Application ready.');
      console.log('All shapes synced and postInitialSync completed.');
    }

  } catch (error) {
    console.error('Data synchronization failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    updateSyncStatus('error', `Sync failed: ${errorMessage}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function cleanupSyncState(pg: PGliteWithExtensions) {
  try {
    console.log('Cleaning up sync state...')
    
    // 先清理同步订阅，避免在删除表后查询
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
    
    // 彻底清空所有相关表，避免主键冲突
    try {
      // 先删除所有表的数据
      await pg.exec(`TRUNCATE TABLE todos CASCADE;`)
      await pg.exec(`TRUNCATE TABLE lists CASCADE;`)
      console.log('Truncated todos and lists tables')
      
      // 重置序列（如果有的话）
      try {
        await pg.exec(`ALTER SEQUENCE IF EXISTS todos_id_seq RESTART WITH 1;`)
        await pg.exec(`ALTER SEQUENCE IF EXISTS lists_id_seq RESTART WITH 1;`)
        console.log('Reset sequences')
      } catch (seqError) {
        console.log('No sequences to reset:', seqError)
      }
      
    } catch (e) {
      console.log('Table cleanup error:', e)
      // 如果 TRUNCATE 失败，尝试 DELETE
      try {
        await pg.exec(`DELETE FROM todos;`)
        await pg.exec(`DELETE FROM lists;`)
        console.log('Deleted todos and lists data as fallback')
      } catch (deleteError) {
        console.log('Delete fallback also failed:', deleteError)
      }
    }
    
    // 清理 meta 表和其他可能的表
    try {
      await pg.exec(`DELETE FROM meta WHERE key = 'slogan';`)
      console.log('Cleaned up meta table')
    } catch (e) {
      console.log('Meta table cleanup:', e)
    }
    
    // 清理 ElectricSQL 系统表（如果存在）
    try {
      await pg.exec(`DELETE FROM electric.subscriptions_metadata;`)
      console.log('Cleaned up electric.subscriptions_metadata')
    } catch (e) {
      console.log('ElectricSQL system table cleanup:', e)
    }
    
    try {
      await pg.exec(`DELETE FROM electric.migrations;`)
      console.log('Cleaned up electric.migrations')
    } catch (e) {
      console.log('ElectricSQL migrations cleanup:', e)
    }
    
    console.log('Sync state cleanup completed')
    
    // 等待一小段时间确保清理完成
    await new Promise(resolve => setTimeout(resolve, 200))
    
  } catch (error) {
    console.log('Cleanup sync state:', error)
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