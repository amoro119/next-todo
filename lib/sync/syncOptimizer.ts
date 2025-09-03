// lib/sync/syncOptimizer.ts
/**
 * 同步性能优化工具
 * 专门优化ElectricSQL同步过程的性能
 */

import type { PGlite } from "@electric-sql/pglite";

type PGliteWithExtensions = PGlite;

/**
 * 清理 UUID 字段，确保只有有效的 UUID 字符串被保留
 */
function sanitizeUuidField(value: unknown): string | null {
  if (!value) return null;

  const stringValue = String(value);

  // 检查是否是有效的 UUID 格式 (8-4-4-4-12 格式)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(stringValue)) {
    return stringValue;
  }

  // 如果不是有效的 UUID，返回 null
  console.warn(`Invalid UUID value received: ${stringValue}, setting to null`);
  return null;
}

interface SyncOptimizationConfig {
  batchSize: number;
  maxConcurrentRequests: number;
  retryDelay: number;
  enableCompression: boolean;
}

const DEFAULT_CONFIG: SyncOptimizationConfig = {
  batchSize: 100,
  maxConcurrentRequests: 3,
  retryDelay: 1000,
  enableCompression: true,
};

export class SyncOptimizer {
  private config: SyncOptimizationConfig;
  private requestQueue: Array<() => Promise<unknown>> = [];
  private activeRequests = 0;

  constructor(config: Partial<SyncOptimizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 优化的批量数据同步
   */
  async optimizedBatchSync(
    pg: PGliteWithExtensions,
    table: string,
    rows: unknown[],
    upsertFn: (batch: unknown[]) => Promise<void>
  ): Promise<void> {
    if (rows.length === 0) return;

    // 对于小数据集，直接处理无需分批
    if (rows.length <= 500) {
      console.log(`⚡ ${table}: 直接处理 ${rows.length} 条记录（小数据集）`);
      await pg.transaction(async () => {
        await upsertFn(rows);
      });
      console.log(`✅ ${table}: 直接同步完成`);
      return;
    }

    const batches = this.createBatches(rows, this.config.batchSize);
    console.log(
      `📦 ${table}: 分批处理 ${rows.length} 条记录，共 ${batches.length} 批`
    );

    // 使用事务批量处理
    await pg.transaction(async (tx) => {
      const batchPromises = batches.map((batch, index) =>
        this.queueRequest(async () => {
          console.log(
            `⚡ ${table}: 处理第 ${index + 1}/${batches.length} 批 (${
              batch.length
            } 条)`
          );
          await upsertFn(batch);
        })
      );

      await Promise.all(batchPromises);
    });

    console.log(`✅ ${table}: 批量同步完成`);
  }

  /**
   * 智能请求队列管理
   */
  private async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const executeRequest = async () => {
        if (this.activeRequests >= this.config.maxConcurrentRequests) {
          // 等待其他请求完成
          setTimeout(
            () => this.queueRequest(requestFn).then(resolve).catch(reject),
            10
          );
          return;
        }

        this.activeRequests++;
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeRequests--;
          this.processQueue();
        }
      };

      executeRequest();
    });
  }

  /**
   * 处理队列中的请求
   */
  private processQueue() {
    while (
      this.requestQueue.length > 0 &&
      this.activeRequests < this.config.maxConcurrentRequests
    ) {
      const nextRequest = this.requestQueue.shift();
      if (nextRequest) {
        nextRequest();
      }
    }
  }

  /**
   * 创建数据批次
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 优化的哈希计算（使用Web Crypto API）
   * 使用modified字段替代id字段进行哈希计算
   */
  async optimizedHashCalculation(data: unknown[], tableName: string = 'unknown'): Promise<string> {
    if (data.length === 0) return "";

    // 使用modified字段进行哈希计算，按id排序确保一致性
    const sortedModifiedTimes = data
      .map((row) => {
        const r = row as { id: string; modified?: string | Date };

        // 统一时间格式处理，确保本地和远程数据格式一致
        let modifiedStr: string;
        if (r.modified instanceof Date) {
          // 对于todos表，统一转换为UTC0时区；对于goals和lists表，保持现有逻辑
          if (tableName === 'todos') {
            // todos表：Date对象直接转换为UTC时间字符串
            modifiedStr = r.modified.toISOString();
          } else {
            // goals和lists表：保持原有逻辑
            modifiedStr = r.modified.toISOString();
          }
        } else if (typeof r.modified === "string") {
          modifiedStr = r.modified;
          // 对于字符串时间，需要正确处理时区
          try {
            let date: Date;
            // 如果字符串以Z结尾，它是UTC时间，直接使用
            if (modifiedStr.endsWith('Z')) {
              date = new Date(modifiedStr);
              if (tableName === 'todos') {
                // todos表：本地数据库中的时间被当成了UTC时间，需要转换回正确的UTC时间
                // 本地时间 = UTC时间 + 8小时（北京时间）
                const originalTime = date.toISOString();
                const correctUtcDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
                modifiedStr = correctUtcDate.toISOString();
                // 添加调试日志
                console.log(`[DEBUG] syncOptimizer todos表时间转换: ${originalTime} -> ${modifiedStr}`);
              } else {
                modifiedStr = date.toISOString();
              }
            } else if (!modifiedStr.includes('+') && !modifiedStr.includes('-')) {
              // 没有时区信息的字符串，需要根据表类型进行不同处理
              if (tableName === 'todos') {
                // todos表：将没有时区信息的字符串当作本地时间处理，然后转换为UTC时间
                // 明确指定为本地时区（北京时间）
                const localTimeStr = modifiedStr.replace(' ', 'T');
                // 假设本地时区为北京时间 (+08:00)
                const localDate = new Date(localTimeStr + '+08:00');
                modifiedStr = localDate.toISOString();
              } else {
                // goals和lists表：保持原有逻辑
                const localDate = new Date(modifiedStr);
                modifiedStr = localDate.toISOString();
              }
            } else {
              // 有时区信息，转换为UTC时间
              date = new Date(modifiedStr);
              modifiedStr = date.toISOString();
            }
          } catch (e) {
            modifiedStr = new Date().toISOString();
          }
        } else {
          modifiedStr = new Date().toISOString();
        }
        
        // 统一时间精度：截断到秒级别，避免毫秒/微秒差异导致哈希不一致
        // 处理各种时间格式：.xxxZ, .xxxxxxZ, .xxx+00, .xxxxxx+00, .xxx+00:00 等
        modifiedStr = modifiedStr.replace(/\.\d+([Z]|[+-]\d{2}:?\d{2}|[+-]\d{2})$/, '.000$1');

        return {
          id: r.id,
          modified: modifiedStr,
        };
      })
      .filter((item) => item.id)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => `${item.id}:${item.modified}`);

    if (sortedModifiedTimes.length === 0) return "";

    const hashInput = sortedModifiedTimes.join("|");

    // 使用统一的哈希算法确保一致性
    return this.fallbackHash(hashInput);
  }

  /**
   * 统一哈希算法
   */
  private fallbackHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(16); // 统一使用16进制格式
  }

  /**
   * 智能重试机制
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    backoffMultiplier: number = 2
  ): Promise<T> {
    let lastError: Error;
    let delay = this.config.retryDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          break;
        }

        console.warn(
          `操作失败，${delay}ms后重试 (${attempt + 1}/${maxRetries}):`,
          error
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= backoffMultiplier;
      }
    }

    throw lastError!;
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.requestQueue = [];
    this.activeRequests = 0;
  }
}

// 全局同步优化器实例
export const syncOptimizer = new SyncOptimizer();

/**
 * 快速初始化同步函数（批量INSERT优化）
 * 专门用于初始化阶段，使用批量INSERT语句最大化性能
 */
export async function fastInitialSync(
  pg: PGliteWithExtensions,
  table: string,
  columns: string[],
  rows: unknown[]
): Promise<void> {
  if (rows.length === 0) return;

  console.log(`⚡ ${table}: 快速批量同步 ${rows.length} 条记录`);

  // 使用单个事务和批量INSERT处理所有数据
  await pg.transaction(async (tx) => {
    if (table === "lists") {
      // 构建批量INSERT语句
      const values: unknown[] = [];
      const placeholders: string[] = [];

      rows.forEach((rowRaw, index) => {
        const row = rowRaw as Record<string, unknown>;
        const baseIndex = index * 5;
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${
            baseIndex + 4
          }, $${baseIndex + 5})`
        );
        values.push(
          row.id ?? null,
          row.name ?? null,
          row.sort_order ?? 0,
          row.is_hidden ?? false,
          row.modified ?? null
        );
      });

      const sql = `
        INSERT INTO lists (id, name, sort_order, is_hidden, modified) 
        VALUES ${placeholders.join(", ")}
        ON CONFLICT(id) DO UPDATE SET 
          name = EXCLUDED.name, 
          sort_order = EXCLUDED.sort_order, 
          is_hidden = EXCLUDED.is_hidden, 
          modified = EXCLUDED.modified
      `;

      await tx.query(sql, values);
    } else if (table === "todos") {
      // 对于todos表，由于字段较多，分批处理以避免参数过多
      const batchSize = 50; // 减少批次大小以避免参数限制

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const values: unknown[] = [];
        const placeholders: string[] = [];

        batch.forEach((rowRaw, index) => {
          const row = rowRaw as Record<string, unknown>;
          const baseIndex = index * 22; // 更新为21个字段
          placeholders.push(
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${
              baseIndex + 4
            }, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${
              baseIndex + 8
            }, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${
              baseIndex + 12
            }, $${baseIndex + 13}, $${baseIndex + 14}, $${baseIndex + 15}, $${
              baseIndex + 16
            }, $${baseIndex + 17}, $${baseIndex + 18}, $${baseIndex + 19}, $${
              baseIndex + 20
            }, $${baseIndex + 21}, $${baseIndex + 22})`
          );

          const cleanedGoalId = sanitizeUuidField(row.goal_id);

          values.push(
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
            sanitizeUuidField(row.list_id), // 确保 list_id 是有效的 UUID 或 null
            row.repeat ?? null,
            row.reminder ?? null,
            row.is_recurring ?? false,
            sanitizeUuidField(row.recurring_parent_id), // 确保 recurring_parent_id 是有效的 UUID 或 null
            row.instance_number ?? null,
            row.next_due_date ?? null,
            cleanedGoalId, // 添加 goal_id 字段
            row.sort_order_in_goal ?? null, // 添加 sort_order_in_goal 字段
            row.modified ?? null // 添加 modified 字段
          );
        });

        const sql = `
          INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id, repeat, reminder, is_recurring, recurring_parent_id, instance_number, next_due_date, goal_id, sort_order_in_goal, modified)
          VALUES ${placeholders.join(", ")}
          ON CONFLICT(id) DO UPDATE SET 
            title = EXCLUDED.title,
            completed = EXCLUDED.completed,
            deleted = EXCLUDED.deleted,
            sort_order = EXCLUDED.sort_order,
            due_date = EXCLUDED.due_date,
            content = EXCLUDED.content,
            tags = EXCLUDED.tags,
            priority = EXCLUDED.priority,
            created_time = EXCLUDED.created_time,
            completed_time = EXCLUDED.completed_time,
            start_date = EXCLUDED.start_date,
            list_id = EXCLUDED.list_id,
            repeat = EXCLUDED.repeat,
            reminder = EXCLUDED.reminder,
            is_recurring = EXCLUDED.is_recurring,
            recurring_parent_id = EXCLUDED.recurring_parent_id,
            instance_number = EXCLUDED.instance_number,
            next_due_date = EXCLUDED.next_due_date,
            goal_id = EXCLUDED.goal_id,
            sort_order_in_goal = EXCLUDED.sort_order_in_goal,
            modified = EXCLUDED.modified
        `;

        await tx.query(sql, values);
      }
    } else if (table === "goals") {
      // 构建批量INSERT语句
      const values: unknown[] = [];
      const placeholders: string[] = [];

      rows.forEach((rowRaw, index) => {
        const row = rowRaw as Record<string, unknown>;
        const baseIndex = index * 10;
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${
            baseIndex + 4
          }, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${
            baseIndex + 8
          }, $${baseIndex + 9}, $${baseIndex + 10})`
        );
        values.push(
          row.id ?? null,
          row.name ?? null,
          row.description ?? null,
          sanitizeUuidField(row.list_id), // 确保 list_id 是有效的 UUID 或 null
          row.start_date ?? null,
          row.due_date ?? null,
          row.priority ?? 0,
          row.created_time ?? null,
          row.is_archived ?? false,
          row.modified ?? null
        );
      });

      const sql = `
        INSERT INTO goals (id, name, description, list_id, start_date, due_date, priority, created_time, is_archived, modified) 
        VALUES ${placeholders.join(", ")}
        ON CONFLICT(id) DO UPDATE SET 
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          list_id = EXCLUDED.list_id,
          start_date = EXCLUDED.start_date,
          due_date = EXCLUDED.due_date,
          priority = EXCLUDED.priority,
          created_time = EXCLUDED.created_time,
          is_archived = EXCLUDED.is_archived,
          modified = EXCLUDED.modified
      `;

      try {
        await tx.query(sql, values);
      } catch (error) {
        // 如果违反外键约束，记录详细信息并重新抛出错误
        if (
          error instanceof Error &&
          error.message.includes("goals_list_id_fkey")
        ) {
          console.error(`❌ goals 表外键约束违规: ${error.message}`);
          // 记录导致问题的具体数据
          for (const rowRaw of rows) {
            const row = rowRaw as Record<string, unknown>;
            const listId = row.list_id;
            if (listId && !sanitizeUuidField(listId)) {
              console.error(
                `📝 无效的 list_id: ${listId} (类型: ${typeof listId})`
              );
            }
          }
        }
        throw error;
      }
    }
  });

  console.log(`✅ ${table}: 快速批量同步完成`);
}

/**
 * 优化的表同步函数（带分批处理）
 * 用于运行时同步，平衡速度和内存使用
 */
export async function optimizedTableSync(
  pg: PGliteWithExtensions,
  table: string,
  columns: string[],
  rows: unknown[],
  isInitialSync: boolean = false
): Promise<void> {
  // 初始化阶段使用快速同步
  if (isInitialSync) {
    return fastInitialSync(pg, table, columns, rows);
  }

  // 运行时使用分批处理
  const upsertFn = async (batch: unknown[]) => {
    for (const rowRaw of batch) {
      const row = rowRaw as Record<string, unknown>;

      if (table === "lists") {
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
      } else if (table === "todos") {
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
            sanitizeUuidField(row.list_id), // 确保 list_id 是有效的 UUID 或 null
            row.repeat ?? null,
            row.reminder ?? null,
            row.is_recurring ?? false,
            sanitizeUuidField(row.recurring_parent_id), // 确保 recurring_parent_id 是有效的 UUID 或 null
            row.instance_number ?? null,
            row.next_due_date ?? null,
            cleanedGoalId, // 添加 goal_id 字段
            row.sort_order_in_goal ?? null, // 添加 sort_order_in_goal 字段
            row.modified ?? null, // 添加 modified 字段
          ]
        );

        console.log(`[DEBUG] Todo upsertFn - 完成，goal_id:`, cleanedGoalId);
      } else if (table === "goals") {
        try {
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
              sanitizeUuidField(row.list_id), // 确保 list_id 是有效的 UUID 或 null
              row.start_date ?? null,
              row.due_date ?? null,
              row.priority ?? 0,
              row.created_time ?? null,
              row.is_archived ?? false,
              row.modified ?? null,
            ]
          );
        } catch (error) {
          // 如果违反外键约束，记录详细信息并重新抛出错误
          if (
            error instanceof Error &&
            error.message.includes("goals_list_id_fkey")
          ) {
            console.error(`❌ goals 表外键约束违规: ${error.message}`);
            console.error(
              `📝 问题数据 - ID: ${row.id}, list_id: ${
                row.list_id
              } (类型: ${typeof row.list_id})`
            );
          }
          throw error;
        }
      }
    }
  };

  await syncOptimizer.optimizedBatchSync(pg, table, rows, upsertFn);
}
