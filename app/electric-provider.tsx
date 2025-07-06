// app/electric-provider.tsx
'use client'

import { useEffect, useState } from 'react'
import { PGliteProvider } from '@electric-sql/pglite-react'
import { PGliteWorker } from '@electric-sql/pglite/worker'
import { live } from '@electric-sql/pglite/live'
import { electricSync } from '@electric-sql/pglite-sync'
import { startSync, useSyncStatus } from './sync'

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
      // 这是 Next.js 中最可靠、最兼容 SSR 的方式
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

      setPg(db)

      // 立即启动同步，不等待leader选举
      console.log('Starting sync immediately...')
      startSync(db)
      
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