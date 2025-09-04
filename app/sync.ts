// app/sync.ts
import { PGlite } from "@electric-sql/pglite";
import { PGliteWithLive } from "@electric-sql/pglite/live";
import { PGliteWithSync } from "@electric-sql/pglite-sync";
import { postInitialSync } from "../db/migrations-client";
import { useEffect, useState } from "react";
import { ShapeStream, Shape } from "@electric-sql/client";
import { getAuthToken, getCachedAuthToken, invalidateToken } from "../lib/auth"; // <--- 导入新的认证模块
import { performanceMonitor, measureAsync } from "../lib/performance/performanceMonitor";
import { shapeSyncManager } from "../lib/sync/ShapeSyncManager"; // 导入ShapeSyncManager

type SyncStatus = "initial-sync" | "done" | "error" | "disabled" | "local-only";

type PGliteWithExtensions = PGliteWithLive & PGliteWithSync;

/**
 * 清理 UUID 字段，确保只有有效的 UUID 字符串被保留
 */
function sanitizeUuidField(value: unknown): string | null {
  if (!value || value === 'null' || value === 'undefined') {
    return null;
  }
  
  const stringValue = String(value).trim();
  
  // 检查是否是有效的 UUID 格式 (8-4-4-4-12 格式)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(stringValue)) {
    return stringValue;
  }
  
  // 如果不是有效的 UUID，返回 null
  console.warn(`Invalid UUID value received: ${stringValue}, setting to null`);
  return null;
}

// --- 认证逻辑现在已移至 lib/auth.ts ---

/**
 * 检查同步配置并返回详细信息
 */
export async function checkSyncConfig() {
  const { getSyncConfig, getSyncDisabledMessage } = await import('../lib/config/syncConfig');
  const syncConfig = getSyncConfig();
  
  return {
    enabled: syncConfig.enabled,
    reason: syncConfig.reason,
    message: syncConfig.enabled ? '同步已启用' : getSyncDisabledMessage(syncConfig.reason),
  };
}

/**
 * 重新评估同步状态并更新状态显示
 * 用于用户状态变化时重新检查同步配置
 */
export async function refreshSyncStatus() {
  const configCheck = await checkSyncConfig();
  
  if (!configCheck.enabled) {
    console.log(`同步状态更新: ${configCheck.reason}`);
    updateSyncStatus('done', configCheck.message);
  } else {
    console.log('同步配置已启用，当前状态保持不变');
  }
  
  return configCheck;
}

export async function startSync(pg: PGliteWithExtensions) {
  return measureAsync('startSync', async () => {
    // 首先检查同步配置
    const configCheck = await measureAsync('checkSyncConfig', () => checkSyncConfig());
    
    if (!configCheck.enabled) {
      console.log(`同步已禁用: ${configCheck.reason}`);
      updateSyncStatus('done', configCheck.message);
      return;
    }

    console.log("Starting ElectricSQL sync...");
    updateSyncStatus("initial-sync", "Starting sync...");

    try {
      // 获取认证令牌
      console.log("正在获取同步认证令牌...");
      await measureAsync('getAuthToken', () => getAuthToken());
      const token = getCachedAuthToken();

      if (!token) {
        throw new Error("认证失败：未能获取到有效的同步令牌。");
      }
      console.log("认证成功，令牌已缓存。");

      // 初始化ElectricSQL系统表
      console.log("Initializing ElectricSQL system tables...");
      await measureAsync('initializeElectricSystemTables', () => initializeElectricSystemTables(pg));

      // 检查本地是否首次同步（无数据时才清理订阅）
      const [listsCountRes, todosCountRes] = await Promise.all([
        pg.query("SELECT COUNT(*) as count FROM lists"),
        pg.query("SELECT COUNT(*) as count FROM todos")
      ]);
      
      const listsCount = Number(
        (listsCountRes.rows[0] as { count: string | number })?.count || 0
      );
      const todosCount = Number(
        (todosCountRes.rows[0] as { count: string | number })?.count || 0
      );
      
      if (listsCount === 0 && todosCount === 0) {
        // 仅首次同步时清理旧的同步订阅
        console.log("首次同步，清理旧的同步订阅...");
        await measureAsync('cleanupOldSubscriptions', () => cleanupOldSubscriptions(pg));
      } else {
        console.log("本地已有数据，跳过订阅清理");
      }

      // 启动非破坏性的双向同步
      console.log("Starting non-destructive bidirectional sync...");
      await measureAsync('startBidirectionalSync', () => startBidirectionalSync(pg));
    } catch (error) {
      console.error("Sync failed:", error);
      
      // 使用专门的同步错误处理
      const { handleSyncStartupError, getSyncStatusFromError } = await import('../lib/sync/syncErrorHandling');
      const errorResult = handleSyncStartupError(error as Error);
      
      console.log(`同步错误类型: ${errorResult.type}, 消息: ${errorResult.message}`);
      
      // 根据错误类型进行特殊处理
      if (errorResult.type === 'auth') {
        // 认证失败时清除缓存的令牌
        invalidateToken();
      }
      
      // 设置相应的同步状态
      const syncStatus = getSyncStatusFromError(errorResult);
      updateSyncStatus(syncStatus, errorResult.message);
      
      // 记录是否可以重试
      if (errorResult.canRetry) {
        console.log('此错误可以重试，同步将在条件改善后自动重试');
      }
    }
  });
}

async function initializeElectricSystemTables(pg: PGliteWithExtensions) {
  console.log("Initializing ElectricSQL system tables...");

  // 优化：减少等待时间，使用轮询检查
  let retries = 0;
  const maxRetries = 10;
  const retryDelay = 200; // 200ms instead of 3000ms total

  while (retries < maxRetries) {
    try {
      await pg.query("SELECT 1");
      console.log("ElectricSQL system tables initialized");
      return;
    } catch (error) {
      retries++;
      if (retries === maxRetries) {
        console.warn("ElectricSQL initialization timeout, continuing anyway");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

async function cleanupOldSubscriptions(pg: PGliteWithExtensions) {
  try {
    console.log("Cleaning up old sync subscriptions...");

    // 只清理旧的同步订阅，不清空数据
    try {
      await pg.sync.deleteSubscription("lists");
      await pg.sync.deleteSubscription("todos");
      await pg.sync.deleteSubscription("meta");
      console.log("Deleted old sync subscriptions");
    } catch (error) {
      console.log(
        "No old subscriptions to delete or error:",
        error instanceof Error ? error.message : String(error)
      );
    }

    // 等待一小段时间确保订阅删除完成
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("Old subscriptions cleanup completed");
  } catch (error) {
    console.log("Cleanup old subscriptions error:", error);
  }
}

// global_last_seen_lsn 本地缓存工具
function getGlobalLastSeenLsn(shapeName: string): string | undefined {
  if (typeof window === "undefined" || typeof localStorage === "undefined")
    return undefined;
  try {
    return (
      localStorage.getItem(`global_last_seen_lsn:${shapeName}`) || undefined
    );
  } catch (e) {
    console.error(`[调试] 读取 global_last_seen_lsn:${shapeName} 失败:`, e);
    return undefined;
  }
}

function setGlobalLastSeenLsn(shapeName: string, lsn: string) {
  if (typeof window === "undefined" || typeof localStorage === "undefined")
    return;
  try {
    localStorage.setItem(`global_last_seen_lsn:${shapeName}`, lsn);
  } catch (e) {
    console.error(`[调试] 写入 global_last_seen_lsn:${shapeName} 失败:`, e);
  }
}

// 数据哈希缓存工具
function setLastSyncHash(shapeName: string, hash: string) {
  if (typeof window === "undefined" || typeof localStorage === "undefined")
    return;
  try {
    localStorage.setItem(`last_sync_hash:${shapeName}`, hash);
  } catch (e) {
    console.error(`写入 last_sync_hash:${shapeName} 失败:`, e);
  }
}

/**
 * 获取某个表的全量数据（通过ShapeStream offset=-1）
 */
export async function getFullShapeRows({
  table,
  columns,
  electricProxyUrl,
  token,
}: {
  table: string;
  columns: string[];
  electricProxyUrl: string;
  token: string;
}): Promise<unknown[]> {
    
  // 检查 columns 配置是否包含 goal_id 字段
  if (table === 'todos' && !columns.includes('goal_id')) {
    console.warn(`[WARN] getFullShapeRows - todos 表的 columns 配置中缺少 goal_id 字段!`);
  }
  
    
  const fullShapeStream = new ShapeStream({
    url: `${electricProxyUrl}/v1/shape`,
    params: {
      table,
      columns,
    },
    subscribe: false,
    offset: "-1",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  
  const fullShape = new Shape(fullShapeStream);
  await fullShape.rows;
  
  const rows = await fullShape.rows;
  return rows;
  
}

/**
 * 规范化并截断日期时间字符串至分钟级别。
 * 如果时间值无效或缺失，则抛出错误。
 * @param modified - 原始时间值（Date对象、字符串或undefined）
 * @param tableName - 相关的表名，用于生成清晰的错误信息
 * @returns 返回格式为 "YYYY-MM-DDTHH:mm" 的字符串
 * @throws {Error} 当 modified 字段无效或缺失时抛出
 */
function normalizeAndTruncateDate(modified: unknown, tableName: string): string {
  let date: Date;

  if (modified instanceof Date) {
    // 检查Date对象是否有效
    if (isNaN(modified.getTime())) {
      throw new Error(`Invalid Date object encountered in table '${tableName}'.`);
    }
    date = modified;
  } else if (typeof modified === 'string' && modified.length > 0) {
    try {
      const parsedDate = new Date(modified);
      // 检查解析出的日期是否有效
      if (isNaN(parsedDate.getTime())) {
        throw new Error(`Invalid date string format in table '${tableName}': "${modified}"`);
      }
      date = parsedDate;

      // 同样保留针对 'todos' 表的特殊时区补偿逻辑
      if (tableName === 'todos') {
        const timezoneOffsetInHours = 8;
        date = new Date(date.getTime() + timezoneOffsetInHours * 60 * 60 * 1000);
      }
    } catch (error) {
      // 如果 new Date() 本身就抛出异常，则包装并重新抛出
      throw new Error(`Error processing date string in table '${tableName}': "${modified}". Original error: ${error.message}`);
    }
  } else {
    // 如果 modified 字段不存在、为null、为空字符串或其他无效类型，直接抛出错误
    throw new Error(`Missing or invalid 'modified' field in table '${tableName}'. Received: ${modified}`);
  }

  // 1. 将Date对象转换为UTC时区的ISO字符串
  // 2. 截断到分钟级别，结果为 "YYYY-MM-DDTHH:mm"
  return date.toISOString().substring(0, 16);
}

/**
 * 优化的数据集哈希值计算（用于快速比较）
 * 使用 'modified' 字段进行哈希计算，能更好地检测数据变更。
 * 时间精度统一到分钟级别。
 * @param rows - 数据行数组
 * @param tableName - 表名，用于日志和特殊处理
 * @returns 数据集的哈希字符串
 * @throws {Error} 如果任何一行数据的 'modified' 字段无效，则会中断并抛出错误
 */
function calculateDataHash(rows: unknown[], tableName: string = 'unknown'): string {
  if (!rows || rows.length === 0) {
    return '';
  }

  // ... (这部分代码与上一版完全相同，无需修改)
  const processedRows = rows
    .map((row) => {
      const r = row as { id?: string; modified?: string | Date };
      console.log(r)
      
      if (!r.id || typeof r.id !== 'string' || r.id.length === 0) {
        return null;
      }
      
      // 调用可能会抛出错误的辅助函数
      return {
        id: r.id,
        modified: normalizeAndTruncateDate(r.modified, tableName)
      };
    })
    .filter((item): item is { id: string; modified: string } => item !== null);

  if (processedRows.length === 0) {
    return '';
  }
    
  const sortedRows = processedRows.sort((a, b) => {
    const idComparison = a.id.localeCompare(b.id);
    if (idComparison !== 0) {
      return idComparison;
    }
    return a.modified.localeCompare(b.modified);
  });

  const finalString = sortedRows.map(item => `${item.id}:${item.modified}`).join("|");

  let hash = 0;
  for (let i = 0; i < finalString.length; i++) {
    const char = finalString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(16);
}


/**
 * 获取本地表的数据哈希
 * 使用modified字段进行哈希计算
 */

async function getLocalDataHash(
  table: string,
  pg: PGliteWithExtensions
): Promise<string> {
  try {
    const result = await pg.query(`SELECT id, modified FROM ${table} ORDER BY id`);
    const rows = result.rows
      .map((row) => ({
        id: (row as { id: string }).id,
        modified: (row as { modified?: string | Date }).modified
      }))
      .filter(row => row.id);
    
    
    return await calculateDataHash(rows, table);
  } catch (error) {
    console.warn(`获取本地${table}数据哈希失败:`, error);
    return "";
  }
}

/**
 * [MODIFIED] 拉取全量数据并与本地数据库进行三步协调（删除、更新、插入）
 * 这是修正后的实现。
 */
async function doFullTableSync({
  table,
  columns,
  electricProxyUrl,
  token,
  pg,
}: {
  table: string;
  columns: string[];
  electricProxyUrl: string;
  token: string;
  pg: PGliteWithExtensions;
  upsertSql: string; // Kept for compatibility, but logic is now self-contained.
}): Promise<void> {
  console.log(`- Starting full reconciliation for table: ${table}`);
  
  
  try {
    // 1. Fetch all rows from the remote server.
    const rows = await getFullShapeRows({
      table,
      columns,
      electricProxyUrl,
      token,
    });
    
        
    const remoteIds = rows.map((r) => (r as { id: string }).id);
    console.log(`- Fetched ${remoteIds.length} remote rows for ${table}.`);

    await pg.transaction(async (tx) => {
      // 2. Delete local rows that are no longer present on the server.
      // This is the key step to fix the localCount > remoteCount issue.
      if (remoteIds.length > 0) {
        const { rows: deletedRows } = await tx.query(
          // Note the removal of the "main" schema prefix.
          `DELETE FROM "${table}" WHERE id NOT IN (${remoteIds
            .map((_, i) => `$${i + 1}`)
            .join(",")}) RETURNING id`,
          remoteIds
        );
        if (deletedRows.length > 0) {
          console.log(
            `- Deleted ${deletedRows.length} orphan rows from local ${table}.`
          );
        }
      } else {
        // 对于goals表，不要在远程为空时清除本地数据
        // 因为goals可能是本地创建的，还没有同步到远程
        if (table !== 'goals') {
          // If the remote table is empty, clear the entire local table.
          const { rows: deletedRows } = await tx.query(
            `DELETE FROM "${table}" RETURNING id`
          );
          if (deletedRows.length > 0) {
            console.log(
              `- Remote table ${table} is empty. Deleted all ${deletedRows.length} local rows.`
            );
          }
        } else {
          console.log(
            `- Remote goals table is empty, but preserving local goals data.`
          );
        }
      }
    });

    // 3. 优化：使用快速同步处理初始化数据
    if (rows.length > 0) {
      // 动态导入优化器以减少初始加载时间
      const { optimizedTableSync } = await import('../lib/sync/syncOptimizer');
      // 初始化阶段使用快速同步，无分批处理
      await optimizedTableSync(pg, table, columns, rows, true);
    }

    console.log(`- ✅ ${table} optimized reconciliation complete.`);
  } catch (error) {
    console.error(`❌ ${table} 表同步失败:`, error);
    // 提供更详细的错误信息
    if (error instanceof Error) {
      console.error(`📝 错误详情: ${error.message}`);
      console.error(`📋 错误堆栈: ${error.stack}`);
    }
    throw error;
  }
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
  upsertSql,
}: {
  table: string;
  columns: string[];
  electricProxyUrl: string;
  token: string;
  pg: PGliteWithExtensions;
  upsertSql: string;
}): Promise<void> {
  // 检查本地表是否为空，若查询失败则默认需要初始upsert
  let shouldInitialUpsert = false;
  try {
    const res = await pg.query(`SELECT 1 FROM ${table} LIMIT 1`);
    shouldInitialUpsert = res.rows.length === 0;
  } catch (e) {
    console.warn("本地表计数失败，默认进行初始upsert:", e);
    shouldInitialUpsert = true;
  }
  if (!shouldInitialUpsert) {
    console.log(`📥 本地${table}表已有数据，跳过初始全量写入`);
    return;
  }
  await doFullTableSync({
    table,
    columns,
    electricProxyUrl,
    token,
    pg,
    upsertSql,
  });
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
  upsertSql,
}: {
  table: string;
  columns: string[];
  electricProxyUrl: string;
  token: string;
  pg: PGliteWithExtensions;
  upsertSql: string;
}): Promise<void> {
  updateSyncStatus("initial-sync", "Starting sync...");
  await doFullTableSync({
    table,
    columns,
    electricProxyUrl,
    token,
    pg,
    upsertSql,
  });
  updateSyncStatus("done");
}

async function startBidirectionalSync(pg: PGliteWithExtensions) {
  const shapes = [
    {
      name: "lists",
      columns: ["id", "name", "sort_order", "is_hidden", "modified"],
    },
    {
      name: "todos",
      columns: [
        "id",
        "title",
        "completed",
        "deleted",
        "sort_order",
        "due_date",
        "content",
        "tags",
        "priority",
        "created_time",
        "completed_time",
        "start_date",
        "list_id",
        "repeat",
        "reminder",
        "is_recurring",
        "recurring_parent_id",
        "instance_number",
        "next_due_date",
        // 目标关联字段
        "goal_id",
        "sort_order_in_goal",
        // 修改时间字段，用于哈希校验
        "modified",
      ],
    },
    {
      name: "goals",
      columns: [
        "id",
        "name",
        "description",
        "list_id",
        "start_date",
        "due_date",
        "priority",
        "created_time",
        "is_archived",
        "modified",
      ],
    },
  ];

  const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
  if (!electricProxyUrl) {
    throw new Error("NEXT_PUBLIC_ELECTRIC_PROXY_URL is not set.");
  }

  const token = getCachedAuthToken();
  if (!token) {
    throw new Error("Authentication token is not available for sync.");
  }

  // 1. 优化：按依赖顺序同步表（lists -> goals -> todos）
  // 先同步 lists 表
  const listsShape = shapes.find(s => s.name === "lists");
  if (listsShape) {
    try {
      const res = await pg.query(`SELECT 1 FROM ${listsShape.name} LIMIT 1`);
      const shouldInitialUpsert = res.rows.length === 0;

      if (shouldInitialUpsert) {
        await doFullTableSync({
          table: listsShape.name,
          columns: listsShape.columns,
          electricProxyUrl,
          token: token!,
          pg,
          upsertSql: "",
        });
        console.log(`📥 ${listsShape.name} 初始同步完成，已写入本地`);
      } else {
        console.log(`📥 本地${listsShape.name}表已有数据，跳过初始全量写入`);
      }
    } catch (e) {
      console.warn(`${listsShape.name} 表检查失败，进行初始同步:`, e);
      await doFullTableSync({
        table: listsShape.name,
        columns: listsShape.columns,
        electricProxyUrl,
        token: token!,
        pg,
        upsertSql: "",
      });
      console.log(`📥 ${listsShape.name} 初始同步完成（异常恢复）`);
    }
  }

  // 再同步 goals 表（依赖 lists 表）
  const goalsShape = shapes.find(s => s.name === "goals");
  if (goalsShape) {
    try {
      const res = await pg.query(`SELECT 1 FROM ${goalsShape.name} LIMIT 1`);
      const shouldInitialUpsert = res.rows.length === 0;

      if (shouldInitialUpsert) {
        await doFullTableSync({
          table: goalsShape.name,
          columns: goalsShape.columns,
          electricProxyUrl,
          token: token!,
          pg,
          upsertSql: "",
        });
        console.log(`📥 ${goalsShape.name} 初始同步完成，已写入本地`);
      } else {
        console.log(`📥 本地${goalsShape.name}表已有数据，跳过初始全量写入`);
      }
    } catch (e) {
      console.warn(`${goalsShape.name} 表检查失败，进行初始同步:`, e);
      await doFullTableSync({
        table: goalsShape.name,
        columns: goalsShape.columns,
        electricProxyUrl,
        token: token!,
        pg,
        upsertSql: "",
      });
      console.log(`📥 ${goalsShape.name} 初始同步完成（异常恢复）`);
    }
  }

  // 最后同步 todos 表（依赖 lists 和 goals 表）
  const todosShape = shapes.find(s => s.name === "todos");
  if (todosShape) {
    try {
      const res = await pg.query(`SELECT 1 FROM ${todosShape.name} LIMIT 1`);
      const shouldInitialUpsert = res.rows.length === 0;

      if (shouldInitialUpsert) {
        await doFullTableSync({
          table: todosShape.name,
          columns: todosShape.columns,
          electricProxyUrl,
          token: token!,
          pg,
          upsertSql: "",
        });
        console.log(`📥 ${todosShape.name} 初始同步完成，已写入本地`);
      } else {
        console.log(`📥 本地${todosShape.name}表已有数据，跳过初始全量写入`);
      }
    } catch (e) {
      console.warn(`${todosShape.name} 表检查失败，进行初始同步:`, e);
      
      await doFullTableSync({
        table: todosShape.name,
        columns: todosShape.columns,
        electricProxyUrl,
        token: token!,
        pg,
        upsertSql: "",
      });
      console.log(`📥 ${todosShape.name} 初始同步完成（异常恢复）`);
    }
  }

  // 2. 优化：并行执行哈希校验，减少串行等待时间
  const hashValidationPromises = shapes.map(async (shapeDef) => {
    const { name: shapeName, columns } = shapeDef;
    
    
    try {
      // 并行获取远程和本地数据哈希
      const [remoteRows, localHash] = await Promise.all([
        getFullShapeRows({
          table: shapeName,
          columns,
          electricProxyUrl,
          token: token!,
        }),
        getLocalDataHash(shapeName, pg)
      ]);

      const remoteHash = await calculateDataHash(remoteRows, shapeName);
      const displayRemoteHash = remoteHash || '(空)';
      const displayLocalHash = localHash || '(空)';
      console.log(`📊 ${shapeName} 哈希校验 -> 远程:${displayRemoteHash} 本地:${displayLocalHash}`);
      

      // 哈希不一致时补偿
      if (localHash !== remoteHash) {
        console.warn(`⚠️ ${shapeName} 数据哈希不一致，准备强制全量同步...`);
        
        await doFullTableSync({
          table: shapeName,
          columns,
          electricProxyUrl,
          token,
          pg,
          upsertSql: "",
        });

        const finalHash = await getLocalDataHash(shapeName, pg);
        const displayHash = finalHash || '(空)';
        console.log(`✅ ${shapeName} 补偿后哈希: ${displayHash}`);
        setLastSyncHash(shapeName, finalHash);
      } else {
        const displayHash = localHash || '(空)';
        console.log(`✅ ${shapeName} 数据哈希一致，无需补偿 (${displayHash})`);
        setLastSyncHash(shapeName, localHash);
      }
    } catch (error) {
      console.error(`❌ ${shapeName} 哈希校验失败:`, error);
      // 继续处理其他表
    }
  });

  // 等待所有哈希校验完成
  await Promise.all(hashValidationPromises);

  // 3. 标记初始同步完成
  if (!initialSyncDone) {
    initialSyncDone = true;
    updateSyncStatus("initial-sync", "Creating indexes...");
    await postInitialSync(pg as unknown as PGlite);
    updateSyncStatus("done");
    console.log("✅ 初始同步完成，准备开始实时同步...");
  }

  // 5. 使用SimpleSyncManager启动实时同步订阅
  const { simpleSyncManager } = await import('../lib/sync/SimpleSyncManager');
  
  // 创建消息处理器，处理实时变更
  const messageProcessor = async (shapeName: string, messages: unknown[]) => {
    if (!messages?.length) return;
    
    for (const msg of messages) {
      // 处理控制消息
      if (msg.headers?.control === "must-refetch") {
        console.warn(
          `[must-refetch] ${shapeName} 收到 must-refetch 控制消息，需要全量同步！`
        );
        continue;
      }

      // 处理LSN
      const msgLsn = msg.headers.global_last_seen_lsn;
      const lastSeenLsn = getGlobalLastSeenLsn(shapeName);
      if (lastSeenLsn !== msg.headers.global_last_seen_lsn) {
        if (typeof msgLsn === "string") {
          setGlobalLastSeenLsn(shapeName, msgLsn);
        }
      }

      if (!("value" in msg && "lsn" in msg.headers)) continue;

      const rowLsn = msg.headers.lsn;
      if (rowLsn && compareLsn(String(rowLsn), String(msgLsn)) >= 0)
        continue;

      const row = msg.value;
      const operation = msg.headers?.operation;
      if (!operation) continue;
      
      // 处理数据变更
      await processShapeChange(shapeName, operation, row, pg);
    }
    
    console.log(`🔄 ${shapeName} 实时变更已同步`);
  };

  // 设置消息处理器并启动SimpleSyncManager订阅
  try {
    simpleSyncManager.setMessageProcessor(messageProcessor);
    await simpleSyncManager.startSync();
    console.log('✅ SimpleSyncManager 订阅已启动');
  } catch (error) {
    console.error('❌ SimpleSyncManager 启动失败:', error);
    throw error;
  }
}

// 将处理 shape 变更的逻辑提取为独立函数
async function processShapeChange(
  shapeName: string,
  operation: string,
  row: Record<string, unknown>,
  pg: PGliteWithExtensions
) {
  if (shapeName === "lists") {
    switch (operation) {
      case "insert":
        await pg.query(
          `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(id) DO UPDATE SET name = $2, sort_order = $3, is_hidden = $4, modified = $5`,
          [
            row.id ?? null,
            row.name ?? null,
            row.sort_order ?? 0,
            row.is_hidden ?? false,
            row.modified ?? null,
          ]
        );
        break;

      case "update":
        const updateFields = Object.keys(row).filter((key) => key !== "id");
        if (updateFields.length > 0) {
          const setClause = updateFields
            .map((key, idx) => `${key} = $${idx + 2}`)
            .join(", ");
          const values = [row.id, ...updateFields.map((key) => row[key])];
          await pg.query(`UPDATE lists SET ${setClause} WHERE id = $1`, values);
        }
        break;

      case "delete":
        await pg.query(`DELETE FROM lists WHERE id = $1`, [row.id ?? null]);
        break;
    }
  } else if (shapeName === "todos") {
    switch (operation) {
      case "insert":
        
        const cleanedGoalId = sanitizeUuidField(row.goal_id);
        
        await pg.query(
          `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id, repeat, reminder, is_recurring, recurring_parent_id, instance_number, next_due_date, goal_id, sort_order_in_goal, modified)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
            ON CONFLICT(id) DO UPDATE SET title=$2, completed=$3, deleted=$4, sort_order=$5, due_date=$6, content=$7, tags=$8, priority=$9, created_time=$10, completed_time=$11, start_date=$12, list_id=$13, repeat=$14, reminder=$15, is_recurring=$16, recurring_parent_id=$17, instance_number=$18, next_due_date=$19, goal_id=$20, sort_order_in_goal=$21, modified=$22`,
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
            sanitizeUuidField(row.list_id), // 清理 list_id
            row.repeat ?? null,
            row.reminder ?? null,
            row.is_recurring ?? false,
            sanitizeUuidField(row.recurring_parent_id), // 清理 recurring_parent_id
            row.instance_number ?? null,
            row.next_due_date ?? null,
            cleanedGoalId, // 使用已清理的 goal_id
            row.sort_order_in_goal ?? null,
            row.modified ?? null, // 添加 modified 字段
          ]
        );
        break;

      case "update":
        
        const updateFields = Object.keys(row).filter((key) => key !== "id");
        if (updateFields.length > 0) {
          const setClause = updateFields
            .map((key, idx) => `${key} = $${idx + 2}`)
            .join(", ");
          // 清理 UUID 字段
          const values = [row.id, ...updateFields.map((key) => {
            if (key === 'list_id' || key === 'recurring_parent_id' || key === 'goal_id') {
              const cleanedValue = sanitizeUuidField(row[key]);
              return cleanedValue;
            }
            return row[key];
          })];
          
          await pg.query(`UPDATE todos SET ${setClause} WHERE id = $1`, values);
        }
        break;

      case "delete":
        await pg.query(`DELETE FROM todos WHERE id = $1`, [row.id ?? null]);
        break;
    }
  } else if (shapeName === "goals") {
    switch (operation) {
      case "insert":
        const cleanedListId = sanitizeUuidField(row.list_id);
        
        await pg.query(
          `INSERT INTO goals (id, name, description, list_id, start_date, due_date, priority, created_time, is_archived, modified) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT(id) DO UPDATE SET 
           name = $2, description = $3, list_id = $4, start_date = $5, 
           due_date = $6, priority = $7, created_time = $8, is_archived = $9, modified = $10`,
          [
            row.id ?? null,
            row.name ?? null,
            row.description ?? null,
            cleanedListId, // 确保 list_id 是有效的 UUID 或 null
            row.start_date ?? null,
            row.due_date ?? null,
            row.priority ?? 0,
            row.created_time ?? null,
            row.is_archived ?? false,
            row.modified ?? null,
          ]
        );
        
        break;

      case "update":
        const updateFields = Object.keys(row).filter((key) => key !== "id");
        if (updateFields.length > 0) {
          const setClause = updateFields
            .map((key, idx) => `${key} = $${idx + 2}`)
            .join(", ");
          // 清理 UUID 字段
          const values = [row.id, ...updateFields.map((key) => {
            if (key === 'list_id') {
              const cleanedValue = sanitizeUuidField(row[key]);
              return cleanedValue;
            }
            return row[key];
          })];
          
          await pg.query(`UPDATE goals SET ${setClause} WHERE id = $1`, values);
        }
        break;

      case "delete":
        // 目标删除实际上是存档操作
        await pg.query(`UPDATE goals SET is_archived = true WHERE id = $1`, [row.id ?? null]);
        break;
    }
  }
}

export function updateSyncStatus(newStatus: SyncStatus, message?: string) {
  // Guard against SSR
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  console.log(`Sync status: ${newStatus} - ${message || ""}`);
  localStorage.setItem("syncStatus", JSON.stringify([newStatus, message]));
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "syncStatus",
      newValue: JSON.stringify([newStatus, message]),
    })
  );
}

export function useSyncStatus(): [SyncStatus, string | undefined] {
  const [syncStatus, setSyncStatus] = useState<
    [SyncStatus, string | undefined]
  >(["initial-sync", "Starting sync..."]);

  useEffect(() => {
    const getStatus = (): [SyncStatus, string | undefined] => {
      // This will only run on the client, where localStorage is available.
      const currentSyncStatusJson = localStorage.getItem("syncStatus");
      return currentSyncStatusJson
        ? JSON.parse(currentSyncStatusJson)
        : ["initial-sync", "Starting sync..."];
    };

    setSyncStatus(getStatus());

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "syncStatus" && e.newValue) {
        setSyncStatus(JSON.parse(e.newValue));
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return syncStatus;
}

/**
 * 获取同步状态的详细信息
 */
export function getSyncStatusInfo(status: SyncStatus, message?: string) {
  const statusInfo = {
    status,
    message: message || '',
    isActive: false,
    isError: false,
    isDisabled: false,
    canRetry: false,
  };

  switch (status) {
    case 'initial-sync':
      statusInfo.isActive = true;
      statusInfo.message = message || '正在同步数据...';
      break;
    case 'done':
      statusInfo.isActive = false;
      statusInfo.message = message || '同步完成';
      break;
    case 'error':
      statusInfo.isError = true;
      statusInfo.canRetry = true;
      statusInfo.message = message || '同步出错';
      break;
    case 'disabled':
    case 'local-only':
      statusInfo.isDisabled = true;
      statusInfo.message = message || '本地模式';
      break;
  }

  return statusInfo;
}

let initialSyncDone = false;
export function waitForInitialSyncDone() {
  return new Promise<void>((resolve) => {
    if (initialSyncDone) {
      resolve();
      return;
    }
    // Guard against SSR
    if (typeof window === "undefined") {
      return;
    }
    const checkStatus = () => {
      const currentSyncStatusJson = localStorage.getItem("syncStatus");
      const [currentStatus] = currentSyncStatusJson
        ? JSON.parse(currentSyncStatusJson)
        : ["initial-sync"];
      if (currentStatus === "done") {
        initialSyncDone = true;
        resolve();
        return true;
      }
      return false;
    };
    if (checkStatus()) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "syncStatus" && e.newValue) {
        if (checkStatus()) {
          window.removeEventListener("storage", handleStorageChange);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
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
