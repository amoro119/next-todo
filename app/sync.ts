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

async function startSyncToDatabase(pg: PGliteWithExtensions) {
  const MAX_RETRIES = 3
  
  // 逐步启用同步：先同步 lists 表，再同步 todos 表
  const shapes = ['lists', 'todos']
  
  console.log('Starting sync for shapes:', shapes)
  
  // 检查并获取必要的环境变量
  const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
  if (!electricProxyUrl) {
    throw new Error("NEXT_PUBLIC_ELECTRIC_PROXY_URL is not set.");
  }
  if (!cachedElectricToken) {
    throw new Error("Authentication token is not available for sync.");
  }

  // 使用 ElectricSQL 的 syncShapeToTable，但添加数据验证
  for (const shapeName of shapes) {
    console.log(`🔄 开始同步 ${shapeName}...`)
    
    let retryCount = 0;
    let success = false;
    
    while (retryCount < MAX_RETRIES && !success) {
      try {
        console.log(`📥 尝试同步 ${shapeName} (尝试 ${retryCount + 1}/${MAX_RETRIES})...`)
        
        // 首先测试数据获取
        const columns = shapeName === 'lists' 
          ? 'id,name,sort_order,is_hidden,modified'
          : 'id,title,completed,deleted,sort_order,due_date,content,tags,priority,created_time,completed_time,start_date,list_id';
        
        const testUrl = `${electricProxyUrl}/v1/shape?table=${shapeName}&columns=${columns}&offset=0`;
        console.log(`🔍 测试数据获取: ${testUrl}`)
        
        const testResponse = await fetch(testUrl, {
          headers: {
            'Authorization': `Bearer ${cachedElectricToken}`
          }
        });
        
        if (!testResponse.ok) {
          throw new Error(`测试数据获取失败: HTTP ${testResponse.status}`);
        }
        
        const testData = await testResponse.json();
        console.log(`📊 ${shapeName} 测试数据: ${testData.rows?.length || 0} 条记录`);
        
        if (testData.rows && testData.rows.length > 0) {
          console.log(`📋 ${shapeName} 数据示例:`, testData.rows[0]);
          
          // 清空本地表
          console.log(`🗑️ 清空本地 ${shapeName} 表...`);
          await pg.exec(`DELETE FROM ${shapeName}`);
          
          // 直接使用手动写入进行初始同步
          console.log(`�� 使用手动写入 ${shapeName} 数据...`);
          
          for (const row of testData.rows) {
            const columns = Object.keys(row).filter(key => row[key] !== null && row[key] !== undefined);
            const values = columns.map(col => {
              const value = row[col];
              if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
              }
              return value;
            });
            
            const insertSql = `INSERT INTO ${shapeName} (${columns.join(', ')}) VALUES (${values.join(', ')})`;
            
            try {
              await pg.exec(insertSql);
            } catch (insertError) {
              console.error(`❌ 插入数据失败:`, insertError);
              throw insertError;
            }
          }
          
          // 验证手动写入
          const manualVerifyResult = await pg.query(`SELECT COUNT(*) as count FROM ${shapeName}`);
          const manualCount = (manualVerifyResult.rows[0] as { count: string }).count;
          console.log(`📊 ${shapeName} 手动写入验证: ${manualCount} 条记录`);
          
          if (parseInt(manualCount) > 0) {
            console.log(`🎉 ${shapeName} 手动写入成功！`);
            success = true;
          } else {
            throw new Error(`${shapeName} 手动写入失败`);
          }
          
          // 在手动写入成功后，建立 ElectricSQL 同步流用于实时同步
          console.log(`🔄 建立 ${shapeName} ElectricSQL 实时同步流...`);
          
          const syncConfig = {
            shape: {
              url: new URL(`${electricProxyUrl}/v1/shape`).toString(),
              params: { 
                table: shapeName,
                columns: shapeName === 'lists' ? 
                  ['id', 'name', 'sort_order', 'is_hidden', 'modified'] :
                  ['id', 'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id']
              },
              headers: {
                'Authorization': `Bearer ${cachedElectricToken}`
              }
            },
            table: shapeName,
            primaryKey: ['id'],
            shapeKey: shapeName,
            onInitialSync: async () => {
              console.log(`✅ ${shapeName} ElectricSQL 实时同步流建立成功`);
            },
            onMustRefetch: async (tx: unknown) => {
              console.log(`⚠️ ${shapeName} Must refetch, 清空表并重试...`);
              await (tx as { query: (sql: string) => Promise<unknown> }).query(`DELETE FROM ${shapeName}`);
              throw new Error(`Must refetch for ${shapeName}`);
            }
          };
          
          try {
            const subscription = await pg.sync.syncShapeToTable(syncConfig);
            console.log(`✅ ${shapeName} ElectricSQL 实时同步流建立成功:`, subscription);
          } catch (electricError) {
            console.warn(`⚠️ ${shapeName} ElectricSQL 实时同步流建立失败，但不影响初始同步:`, electricError);
          }
          
            } else {
          console.log(`⚠️ ${shapeName} 没有数据需要同步`);
          success = true; // 没有数据也算成功
        }
        
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
  }

  console.log('🎉 所有数据同步完成！');
  
  // 最终验证
  for (const shapeName of shapes) {
    try {
      const result = await pg.query(`SELECT COUNT(*) as count FROM ${shapeName}`);
      const count = (result.rows[0] as { count: string }).count;
      console.log(`📊 最终验证 ${shapeName}: ${count} 条记录`);
    } catch (error) {
      console.error(`❌ 验证 ${shapeName} 失败:`, error);
    }
  }

  if (!initialSyncDone) {
    initialSyncDone = true;
    updateSyncStatus('initial-sync', 'Creating indexes...');
    await postInitialSync(pg as unknown as PGlite);
    updateSyncStatus('done');
    console.log('✅ 同步完成，应用已准备就绪');
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