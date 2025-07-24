// app/electric-provider.tsx
'use client'
import { useEffect, useState } from 'react'
import { PGliteProvider } from '@electric-sql/pglite-react'
import { PGliteWorker } from '@electric-sql/pglite/worker'
import { live } from '@electric-sql/pglite/live'
import { electricSync } from '@electric-sql/pglite-sync'
import { startSync, useSyncStatus } from './sync'
import { initOfflineSync } from '../lib/sync/initOfflineSync'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PGliteWithExtensions = PGliteWorker & { live: any; sync: any }
const LoadingScreen = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      <div className="mt-4 text-gray-600">{children}</div>
    </div>
  )
}
export function ElectricProvider({ children }: { children: React.ReactNode }) {
  const [pg, setPg] = useState<PGliteWithExtensions | null>(null)
  const [syncStatus, syncMessage] = useSyncStatus()
  useEffect(() => {
    let isMounted = true
    let leaderSub: (() => void) | undefined
    let worker: Worker | undefined;
    const init = async () => {
      // 使用标准的 Web Worker API 和 URL 对象来创建 worker
      worker = new Worker(new URL('./pglite-worker.ts', import.meta.url), {
        type: 'module',
      });
      // PGliteWorker.create 接受一个标准的 Worker 实例
      const db = (await PGliteWorker.create(worker, {
        extensions: {
          live,
          sync: electricSync(),
        },
      })) as PGliteWithExtensions
      if (!isMounted) return

      // 创建同步队列表
      console.log('Creating sync queue table...')
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS sync_queue (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            table_name TEXT NOT NULL,
            operation TEXT NOT NULL,
            record_id TEXT NOT NULL,
            data JSONB NOT NULL,
            timestamp TEXT NOT NULL,
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `)
        
        await db.query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);`)
        await db.query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp);`)
        await db.query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_table_record ON sync_queue(table_name, record_id);`)
        
        console.log('Sync queue table created successfully')
      } catch (error) {
        console.error('Failed to create sync queue table:', error)
      }

      // 初始化离线同步系统
      console.log('Initializing offline sync system...')
      try {
        initOfflineSync(db)
        console.log('Offline sync system initialized successfully')
      } catch (error) {
        console.error('Failed to initialize offline sync system:', error)
      }

      setPg(db)
      // 将 PGlite 实例暴露到 window 对象上，方便调试
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).pg = db;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).pg = db;
      }
      // 监听leader变化，但同步已经启动
      leaderSub = db.onLeaderChange(() => {
        console.log('Leader changed, isLeader:', db.isLeader)
      })
    }
    init()
    return () => {
      isMounted = false
      leaderSub?.()
      // 在组件卸载时终止 worker，防止内存泄漏
      worker?.terminate()
    }
  }, [])
  // 只有 pg 初始化好后再启动同步
  useEffect(() => {
    if (pg) {
      // 立即启动同步，不等待leader选举
      console.log('Starting sync immediately...')
      startSync(pg)
    }
  }, [pg])
  if (!pg) {
    // 初始加载由 `electric-client-provider` 的 loading 处理
    return null
  }
  if (syncStatus === 'initial-sync') {
    return <LoadingScreen>{syncMessage || '正在同步数据...'}</LoadingScreen>
  }
  
  if (syncStatus === 'error') {
    return <LoadingScreen>数据同步出错，请检查控制台。</LoadingScreen>
  }
  return (
    <PGliteProvider db={pg}>
      {children}
    </PGliteProvider>
  )
}