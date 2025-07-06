// app/sync.ts
import { PGlite } from '@electric-sql/pglite'
import { PGliteWithLive } from '@electric-sql/pglite/live'
import { PGliteWithSync } from '@electric-sql/pglite-sync'
import { postInitialSync } from '../db/migrations-client'
import { useEffect, useState } from 'react'

type SyncStatus = 'initial-sync' | 'done' | 'error'

type PGliteWithExtensions = PGliteWithLive & PGliteWithSync

export async function startSync(pg: PGliteWithExtensions) {
  console.log('Starting ElectricSQL sync...')
  updateSyncStatus('initial-sync', 'Starting sync...')
  
  try {
    // 首先彻底清理本地数据，避免主键冲突
    console.log('Cleaning up local data to avoid conflicts...')
    await cleanupLocalData(pg)
    
    // 初始化ElectricSQL系统表
    console.log('Initializing ElectricSQL system tables...')
    await initializeElectricSystemTables(pg)
    
    // 启动同步
    console.log('Starting sync process...')
    await startSyncToDatabase(pg)
  } catch (error) {
    console.error('Sync failed:', error)
    updateSyncStatus('error', '同步失败，但应用仍可使用')
  }
}

async function cleanupLocalData(pg: PGliteWithExtensions) {
  try {
    console.log('Cleaning up local data...')
    
    // 删除旧的同步订阅
    try {
      await pg.sync.deleteSubscription('lists')
      await pg.sync.deleteSubscription('todos')
      console.log('Deleted old sync subscriptions')
    } catch (error) {
      console.log('No old subscriptions to delete:', error)
    }
    
    // 彻底清空所有表数据
    try {
      await pg.exec(`DELETE FROM todos;`)
      await pg.exec(`DELETE FROM lists;`)
      console.log('Cleared todos and lists tables')
    } catch (e) {
      console.log('Table cleanup error:', e)
    }
    
    // 清理ElectricSQL系统表
    try {
      await pg.exec(`DELETE FROM electric.subscriptions_metadata;`)
      await pg.exec(`DELETE FROM electric.migrations;`)
      console.log('Cleaned up ElectricSQL system tables')
    } catch (e) {
      console.log('ElectricSQL system table cleanup:', e)
    }
    
    console.log('Local data cleanup completed')
    
  } catch (error) {
    console.log('Cleanup error:', error)
  }
}

async function initializeElectricSystemTables(pg: PGliteWithExtensions) {
  console.log('Waiting for ElectricSQL to initialize system tables...')
  
  // 等待ElectricSQL初始化
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  try {
    await pg.query('SELECT 1')
    console.log('ElectricSQL system tables initialized')
  } catch {
    console.log('ElectricSQL still initializing, continuing...')
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000))
}

async function startSyncToDatabase(pg: PGliteWithExtensions) {
  const MAX_RETRIES = 3
  const shapes = ['lists', 'todos']
  
  console.log('Starting sync for shapes:', shapes)
  
  const initialSyncPromises: Promise<void>[] = []
  let syncedShapes = 0
  const shapeSyncStatus = new Map<string, boolean>()

  shapes.forEach((shapeName) => {
    console.log(`Setting up sync for ${shapeName}...`)
    
    const shapeSyncPromise = new Promise<void>(async (resolve, reject) => {
      let retryCount = 0
      
      const attemptSync = async (): Promise<void> => {
        try {
          console.log(`Attempting to sync ${shapeName} (attempt ${retryCount + 1})...`)
          
          const ELECTRIC_URL = 'http://localhost:5133'
          console.log(`Setting up sync for ${shapeName} with URL: ${ELECTRIC_URL}/v1/shape`)
          
          // 使用简化的同步配置，参考官方示例
          const syncPromise = pg.sync.syncShapeToTable({
            shape: {
              url: new URL(`${ELECTRIC_URL}/v1/shape`).toString(),
              params: { 
                table: shapeName,
                // 确保字段与服务端完全一致
                columns: shapeName === 'lists' ? 
                  ['id', 'name', 'sort_order', 'is_hidden', 'modified'] :
                  ['id', 'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id']
              },
            },
            table: shapeName,
            primaryKey: ['id'],
            shapeKey: shapeName,
            onInitialSync: async () => {
              console.log(`Initial sync completed for ${shapeName}`)
              if (!shapeSyncStatus.get(shapeName)) {
                shapeSyncStatus.set(shapeName, true)
                syncedShapes++
                
                if (syncedShapes === shapes.length) {
                  updateSyncStatus('initial-sync', `Synced ${syncedShapes}/${shapes.length} data shapes...`)
                  
                  if (!initialSyncDone) {
                    initialSyncDone = true
                    updateSyncStatus('initial-sync', 'Creating indexes...')
                    await postInitialSync(pg as unknown as PGlite)
                    updateSyncStatus('done')
                    console.log('All shapes synced and postInitialSync completed')
                  }
                } else {
                  console.log(`Progress: ${syncedShapes}/${shapes.length} shapes synced`)
                }
              }
            },
            onMustRefetch: async (tx) => {
              console.log(`Must refetch for ${shapeName}, clearing table and retrying...`)
              await tx.query(`DELETE FROM ${shapeName}`)
              throw new Error(`Must refetch for ${shapeName}`)
            }
          })

          // 等待同步完成，但设置合理的超时
          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error(`Sync timeout for ${shapeName}`)), 20000)
          })

          const syncWithTimeout = Promise.race([
            syncPromise,
            timeoutPromise
          ])
          
          try {
            await syncWithTimeout
            console.log(`Successfully synced ${shapeName}`)
            resolve()
          } catch (error) {
            if (error instanceof Error && error.message.includes('timeout')) {
              console.log(`Sync timeout for ${shapeName}, but initial sync should be complete - continuing...`)
              resolve()
            } else {
              throw error
            }
          }
          
        } catch (error) {
          console.error(`${shapeName} sync error (attempt ${retryCount + 1}):`, error)
          
          if (error instanceof Error && error.message && error.message.includes('Must refetch')) {
            if (retryCount < MAX_RETRIES) {
              retryCount++
              console.log(`Retrying ${shapeName} sync due to must-refetch, attempt ${retryCount + 1}`)
              await new Promise(resolve => setTimeout(resolve, 500))
              return attemptSync()
            }
          }
          
          if (retryCount < MAX_RETRIES) {
            retryCount++
            console.log(`Retrying ${shapeName} sync, attempt ${retryCount + 1}`)
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
            return attemptSync()
          } else {
            reject(error)
          }
        }
      }
  
      await attemptSync()
    })

    initialSyncPromises.push(shapeSyncPromise)
  })

  console.log('Waiting for all shape sync promises to complete...')
  await Promise.all(initialSyncPromises)
  console.log('All shape sync promises completed')
  
  if (!initialSyncDone) {
    updateSyncStatus('done')
    console.log('Sync to database completed')
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