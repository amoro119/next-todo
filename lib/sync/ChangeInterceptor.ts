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
    } else if (operation === 'update') {
      // 更新操作只包含变更的字段
      const updatableFields = ['title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 'tags', 'priority', 'completed_time', 'start_date', 'list_id']
      
      for (const field of updatableFields) {
        if (field in data && data[field] !== undefined) {
          if (field === 'completed' || field === 'deleted') {
            sanitized[field] = Boolean(data[field])
          } else if (field === 'sort_order' || field === 'priority') {
            sanitized[field] = Number(data[field]) || 0
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
export class DatabaseWrapper {
  private changeInterceptor?: ChangeInterceptor

  constructor(private db: PGlite) {}

  setChangeInterceptor(interceptor: ChangeInterceptor): void {
    this.changeInterceptor = interceptor
  }

  /**
   * 包装的插入操作
   */
  async insert(table: 'todos' | 'lists', data: Record<string, unknown>): Promise<unknown> {
    const id = typeof data.id === 'string' ? data.id : String(data.id)
    const operation: DatabaseOperation = {
      table,
      operation: 'insert',
      data,
      id,
      timestamp: new Date().toISOString()
    }

    // 拦截操作
    if (this.changeInterceptor) {
      await this.changeInterceptor.interceptWrite(operation)
    }

    // 执行实际的数据库操作
    return this.executeInsert(table, data)
  }

  /**
   * 包装的更新操作
   */
  async update(table: 'todos' | 'lists', id: string, data: Record<string, unknown>): Promise<unknown> {
    const realId = typeof id === 'string' ? id : String(id)
    
    // 修复：创建一个包含 ID 的新数据对象
    const dataWithId = { ...data, id: realId };

    const operation: DatabaseOperation = {
      table,
      operation: 'update',
      data: dataWithId, // 使用包含 ID 的数据
      id: realId,
      timestamp: new Date().toISOString()
    }

    // 拦截操作
    if (this.changeInterceptor) {
      await this.changeInterceptor.interceptWrite(operation)
    }

    // 执行实际的数据库操作
    return this.executeUpdate(table, id, data)
  }

  /**
   * 包装的删除操作
   */
  async delete(table: 'todos' | 'lists', id: string): Promise<unknown> {
    const realId = typeof id === 'string' ? id : String(id)
    const operation: DatabaseOperation = {
      table,
      operation: 'delete',
      data: { id: realId },
      id: realId,
      timestamp: new Date().toISOString()
    }

    // 拦截操作
    if (this.changeInterceptor) {
      await this.changeInterceptor.interceptWrite(operation)
    }

    // 执行实际的数据库操作
    return this.executeDelete(table, id)
  }

  /**
   * 直接访问原始数据库实例（用于读操作）
   */
  get raw(): PGlite {
    return this.db
  }

  // 私有方法：执行实际的数据库操作
  private async executeInsert(table: string, data: Record<string, unknown>): Promise<unknown> {
    if (table === 'todos') {
      const columns = ['id', 'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id']
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
    }
  }

  private async executeUpdate(table: string, id: string, data: Record<string, unknown>): Promise<unknown> {
    const entries = Object.entries(data).filter(([key]) => key !== 'id')
    if (entries.length === 0) return

    if (table === 'lists') {
      // 为 lists 表自动添加 modified 时间戳
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
    return this.db.query(`DELETE FROM ${table} WHERE id = $1`, [id])
  }
}