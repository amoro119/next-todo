// lib/sync/ChangeInterceptor.ts
import { PGlite } from '@electric-sql/pglite'
import { DatabaseOperation } from './types'
import { SyncQueueManager } from './SyncQueueManager'
import { networkStatusManager } from './NetworkStatusManager'
import { getSyncScheduler } from './initOfflineSync'

export interface ChangeInterceptor {
  // 拦截数据库写操作
  interceptWrite(operation: DatabaseOperation): Promise<void>
  
  // 检查是否为离线状态
  isOffline(): boolean
  
  // 创建变更记录
  createChangeRecord(operation: DatabaseOperation): DatabaseOperation
  
  // 启用/禁用拦截器
  setEnabled(enabled: boolean): void
  
  // 检查拦截器状态
  isEnabled(): boolean
}

export class ChangeInterceptorImpl implements ChangeInterceptor {
  private enabled = true
  
  constructor(
    private db: PGlite,
    private syncQueueManager: SyncQueueManager
  ) {}

  async interceptWrite(operation: DatabaseOperation): Promise<void> {
    if (!this.enabled) {
      return
    }

    try {
      console.log(
        `Intercepted write operation: ${operation.operation} on ${operation.table}:${operation.id}`
      )

      const changeRecord = this.createChangeRecord(operation)
      if (this.isOffline()) {
        // 离线时添加到同步队列
        await this.syncQueueManager.createChangeFromOperation(changeRecord)
        console.log(
          `Added change to sync queue: ${operation.operation} on ${operation.table}:${operation.id}`
        )
      } else {
        // 在线时直接同步
        await this.syncQueueManager.createChangeFromOperation(changeRecord)
        console.log(
          `Added change to sync queue: ${operation.operation} on ${operation.table}:${operation.id}`
        )
        // 立刻触发同步
        const scheduler = getSyncScheduler()
        if (scheduler) {
          await scheduler.triggerSync()
        } else {
          console.warn('SyncScheduler 未初始化，无法立即同步')
        }
      }
    } catch (error) {
      console.error('Failed to intercept write operation:', error)
      // 不抛出错误，以避免破坏面向用户的操作
    }
  }

  isOffline(): boolean {
    // 使用网络状态管理器检查当前网络状态
    return !networkStatusManager.isOnline()
  }

  createChangeRecord(operation: DatabaseOperation): DatabaseOperation {
    // 确保数据完整性和一致性
    const sanitizedData = this.sanitizeOperationData(operation)
    
    return {
      ...operation,
      data: sanitizedData,
      timestamp: operation.timestamp || new Date().toISOString()
    }
  }

  // 私有方法：清理和验证操作数据
  private sanitizeOperationData(operation: DatabaseOperation): Record<string, unknown> {
    const { table, data, operation: op } = operation
    
    // 确保ID存在
    if (!data.id) {
      throw new Error(`Missing ID for ${op} operation on ${table}`)
    }
    
    // 根据表类型验证和清理数据
    if (table === 'todos') {
      return this.sanitizeTodoData(data, op)
    } else if (table === 'lists') {
      return this.sanitizeListData(data, op)
    } else if (table === 'goals') {
      return this.sanitizeGoalData(data, op)
    }
    
    return data
  }

  private sanitizeTodoData(data: Record<string, unknown>, operation: string): Record<string, unknown> {
    const sanitized: Record<string, unknown> = { id: data.id }
    
    // 根据操作类型包含相应字段
    if (operation === 'insert') {
      // 插入操作需要所有必要字段
      sanitized.title = data.title || ''
      sanitized.completed = Boolean(data.completed)
      sanitized.deleted = Boolean(data.deleted)
      sanitized.sort_order = Number(data.sort_order) || 0
      sanitized.due_date = data.due_date || null
      sanitized.content = data.content || null
      sanitized.tags = data.tags || null
      sanitized.priority = Number(data.priority) || 0
      sanitized.created_time = data.created_time || new Date().toISOString()
      sanitized.completed_time = data.completed_time || null
      sanitized.start_date = data.start_date || null
      sanitized.list_id = data.list_id || null
      // 重复任务相关字段
      sanitized.repeat = data.repeat || null
      sanitized.reminder = data.reminder || null
      sanitized.is_recurring = Boolean(data.is_recurring)
      sanitized.recurring_parent_id = data.recurring_parent_id || null
      sanitized.instance_number = data.instance_number !== undefined ? Number(data.instance_number) : null
      sanitized.next_due_date = data.next_due_date || null
      // 目标关联字段
      sanitized.goal_id = this.sanitizeUuidField(data.goal_id)
      sanitized.sort_order_in_goal = data.sort_order_in_goal !== undefined ? Number(data.sort_order_in_goal) : null
    } else if (operation === 'update') {
      // 更新操作只包含变更的字段
      const updatableFields = [
        'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 
        'tags', 'priority', 'completed_time', 'start_date', 'list_id',
        // 重复任务相关字段
        'repeat', 'reminder', 'is_recurring', 'recurring_parent_id', 'instance_number', 'next_due_date',
        // 目标关联字段
        'goal_id', 'sort_order_in_goal'
      ]
      
      for (const field of updatableFields) {
        if (field in data && data[field] !== undefined) {
          if (field === 'completed' || field === 'deleted' || field === 'is_recurring') {
            sanitized[field] = Boolean(data[field])
          } else if (field === 'sort_order' || field === 'priority' || field === 'instance_number' || field === 'sort_order_in_goal') {
            sanitized[field] = Number(data[field]) || 0
          } else if (field === 'goal_id' || field === 'list_id' || field === 'recurring_parent_id') {
            // UUID 字段需要特殊处理
            sanitized[field] = this.sanitizeUuidField(data[field])
          } else {
            sanitized[field] = data[field]
          }
        }
      }
    } else if (operation === 'delete') {
      // 删除操作只需要ID
      // 实际上我们使用软删除，所以设置deleted标志
      sanitized.deleted = true
    }
    
    return sanitized
  }

  private sanitizeListData(data: Record<string, unknown>, operation: string): Record<string, unknown> {
    const sanitized: Record<string, unknown> = { id: data.id }
    
    if (operation === 'insert') {
      // 插入操作需要所有必要字段
      sanitized.name = data.name || ''
      sanitized.sort_order = Number(data.sort_order) || 0
      sanitized.is_hidden = Boolean(data.is_hidden)
      sanitized.modified = data.modified || new Date().toISOString()
    } else if (operation === 'update') {
      // 更新操作只包含变更的字段
      const updatableFields = ['name', 'sort_order', 'is_hidden']
      
      for (const field of updatableFields) {
        if (field in data && data[field] !== undefined) {
          if (field === 'is_hidden') {
            sanitized[field] = Boolean(data[field])
          } else if (field === 'sort_order') {
            sanitized[field] = Number(data[field]) || 0
          } else {
            sanitized[field] = data[field]
          }
        }
      }
      
      // 更新操作总是更新modified时间
      sanitized.modified = new Date().toISOString()
    } else if (operation === 'delete') {
      // 删除操作只需要ID
    }
    
    return sanitized
  }

  /**
   * 清理 UUID 字段，确保只有有效的 UUID 字符串被保留
   */
  private sanitizeUuidField(value: unknown): string | null {
    if (!value) return null;
    
    const stringValue = String(value);
    
    // 检查是否是有效的 UUID 格式 (8-4-4-4-12 格式)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(stringValue)) {
      return stringValue;
    }
    
    // 如果不是有效的 UUID，返回 null
    console.warn(`Invalid UUID value received: ${stringValue}, setting to null`);
    return null;
  }

  private sanitizeGoalData(data: Record<string, unknown>, operation: string): Record<string, unknown> {
    const sanitized: Record<string, unknown> = { id: data.id }
    
    if (operation === 'insert') {
      // 插入操作需要所有必要字段
      sanitized.name = data.name || ''
      sanitized.description = data.description || null
      // 确保 list_id 是正确的 UUID 字符串类型或 null
      sanitized.list_id = this.sanitizeUuidField(data.list_id)
      sanitized.start_date = data.start_date || null
      sanitized.due_date = data.due_date || null
      sanitized.priority = Number(data.priority) || 0
      sanitized.created_time = data.created_time || new Date().toISOString()
      sanitized.is_archived = Boolean(data.is_archived)
    } else if (operation === 'update') {
      // 更新操作只包含变更的字段
      const updatableFields = [
        'name', 'description', 'list_id', 'start_date', 'due_date', 
        'priority', 'is_archived'
      ]
      
      for (const field of updatableFields) {
        if (field in data && data[field] !== undefined) {
          if (field === 'is_archived') {
            sanitized[field] = Boolean(data[field])
          } else if (field === 'priority') {
            sanitized[field] = Number(data[field]) || 0
          } else if (field === 'list_id') {
            // 确保 list_id 是正确的 UUID 字符串类型或 null
            sanitized[field] = this.sanitizeUuidField(data[field])
          } else {
            sanitized[field] = data[field]
          }
        }
      }
    } else if (operation === 'delete') {
      // 目标删除实际上是存档操作
      sanitized.is_archived = true
    }
    
    return sanitized
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    console.log(`ChangeInterceptor ${enabled ? 'enabled' : 'disabled'}`)
  }

  isEnabled(): boolean {
    return this.enabled
  }
}

/**
 * 数据库操作包装器 - 用于拦截数据库写操作
 */
// lib/sync/ChangeInterceptor.ts 中的 DatabaseWrapper 类（已修改）

export class DatabaseWrapper {
  private changeInterceptor?: ChangeInterceptor

  constructor(private db: PGlite) {}

  setChangeInterceptor(interceptor: ChangeInterceptor): void {
    this.changeInterceptor = interceptor
  }

  /**
   * 包装的插入操作（先本地写入，后拦截）
   */
  async insert(table: 'todos' | 'lists' | 'goals', data: Record<string, unknown>): Promise<unknown> {
    const id = String(data.id)

    // ✅ 1. 先执行本地数据库操作
    await this.executeInsert(table, data)

    // ✅ 2. 成功后创建变更记录并进入同步流程
    const operation: DatabaseOperation = {
      table,
      operation: 'insert',
      data,
      id,
      timestamp: new Date().toISOString()
    }

    if (this.changeInterceptor) {
      // ✅ 异步处理同步，不阻塞本地操作
      this.changeInterceptor.interceptWrite(operation).catch(err => {
        console.error('Failed to intercept write after local insert:', err)
      })
    }

    return { id }
  }

  /**
   * 包装的更新操作（先本地写入，后拦截）
   */
  async update(table: 'todos' | 'lists' | 'goals', id: string, data: Record<string, unknown>): Promise<unknown> {
    const realId = String(id)
    const dataWithId = { ...data, id: realId }

    // ✅ 1. 先执行本地数据库操作
    await this.executeUpdate(table, id, data)

    // ✅ 2. 成功后创建变更记录
    const operation: DatabaseOperation = {
      table,
      operation: 'update',
      data: dataWithId,
      id: realId,
      timestamp: new Date().toISOString()
    }

    if (this.changeInterceptor) {
      // ✅ 异步处理同步
      this.changeInterceptor.interceptWrite(operation).catch(err => {
        console.error('Failed to intercept write after local update:', err)
      })
    }

    return { id: realId }
  }

  /**
   * 包装的删除操作（先本地写入，后拦截）
   */
  async delete(table: 'todos' | 'lists' | 'goals', id: string): Promise<unknown> {
    const realId = String(id)

    // ✅ 1. 先执行本地数据库操作
    await this.executeDelete(table, id)

    // ✅ 2. 成功后创建变更记录
    const operation: DatabaseOperation = {
      table,
      operation: 'delete',
      data: { id: realId },
      id: realId,
      timestamp: new Date().toISOString()
    }

    if (this.changeInterceptor) {
      // ✅ 异步处理同步
      this.changeInterceptor.interceptWrite(operation).catch(err => {
        console.error('Failed to intercept write after local delete:', err)
      })
    }

    return { id: realId }
  }

  /**
   * 直接访问原始数据库实例（用于读操作）
   */
  get raw(): PGlite {
    return this.db
  }

  // ======================
  // 以下方法保持不变（未修改）
  // ======================

  private async executeInsert(table: string, data: Record<string, unknown>): Promise<unknown> {
    if (table === 'todos') {
      const columns = [
        'id', 'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 
        'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id',
        // 重复任务相关字段
        'repeat', 'reminder', 'is_recurring', 'recurring_parent_id', 'instance_number', 'next_due_date',
        // 目标关联字段
        'goal_id', 'sort_order_in_goal'
      ]
      const values = columns.map(col => data[col] ?? null)
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
      return this.db.query(
        `INSERT INTO todos (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      )
    } else if (table === 'lists') {
      const columns = ['id', 'name', 'sort_order', 'is_hidden', 'modified']
      const values = columns.map(col => col === 'modified' ? new Date().toISOString() : (data[col] ?? null))
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
      return this.db.query(
        `INSERT INTO lists (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      )
    } else if (table === 'goals') {
      const columns = [
        'id', 'name', 'description', 'list_id', 'start_date', 'due_date', 
        'priority', 'created_time', 'is_archived'
      ]
      const values = columns.map(col => data[col] ?? null)
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
      return this.db.query(
        `INSERT INTO goals (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      )
    }
  }

  private async executeUpdate(table: string, id: string, data: Record<string, unknown>): Promise<unknown> {
    const entries = Object.entries(data).filter(([key]) => key !== 'id')
    if (entries.length === 0) return

    if (table === 'lists') {
      entries.push(['modified', new Date().toISOString()])
    }

    const setClause = entries.map(([key], i) => `${key} = $${i + 2}`).join(', ')
    const values = [id, ...entries.map(([, value]) => value)]

    return this.db.query(
      `UPDATE ${table} SET ${setClause} WHERE id = $1`,
      values
    )
  }

  private async executeDelete(table: string, id: string): Promise<unknown> {
    if (table === 'goals') {
      // 目标删除实际上是存档操作
      return this.db.query(`UPDATE goals SET is_archived = true WHERE id = $1`, [id])
    } else {
      return this.db.query(`DELETE FROM ${table} WHERE id = $1`, [id])
    }
  }
}