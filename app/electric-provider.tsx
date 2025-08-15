// app/electric-provider.tsx
'use client'
import { useEffect, useState } from 'react'
import { PGliteProvider } from '@electric-sql/pglite-react'
import { PGliteWorker } from '@electric-sql/pglite/worker'
import { live } from '@electric-sql/pglite/live'
import { electricSync } from '@electric-sql/pglite-sync'
import { startSync, useSyncStatus, updateSyncStatus } from './sync'
import { initOfflineSync } from '../lib/sync/initOfflineSync'
import { getSyncConfig, getSyncDisabledMessage, type SyncConfig, initializeAppConfig } from '../lib/config'
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
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({ enabled: false })
  const [syncStatus, syncMessage] = useSyncStatus()
  // 检查同步配置并监听变化
  useEffect(() => {
    const updateConfig = () => {
      const config = getSyncConfig()
      setSyncConfig(config)
      console.log('同步配置更新:', config)
    }

    // 初始化应用配置
    const initConfig = async () => {
      try {
        await initializeAppConfig()
        updateConfig()
      } catch (error) {
        console.error('配置初始化失败:', error)
        updateConfig() // 即使初始化失败也要更新配置
      }
    }

    initConfig()

    // 监听用户状态变化
    const handleUserStateChange = () => updateConfig()
    window.addEventListener('userStateChanged', handleUserStateChange)

    // 监听同步配置变化
    const handleSyncConfigChange = () => updateConfig()
    window.addEventListener('syncConfigChanged', handleSyncConfigChange)

    // 注意：我们不再监听网络状态变化来改变同步配置
    // 网络状态由同步系统内部处理

    return () => {
      window.removeEventListener('userStateChanged', handleUserStateChange)
      window.removeEventListener('syncConfigChanged', handleSyncConfigChange)
    }
  }, [])

  // 初始化 PGlite 数据库 (始终初始化，包含所有扩展)
  useEffect(() => {
    let isMounted = true
    let leaderSub: (() => void) | undefined
    let worker: Worker | undefined;
    
    const init = async () => {
      try {
        // 使用标准的 Web Worker API 和 URL 对象来创建 worker
        worker = new Worker(new URL('./pglite-worker.ts', import.meta.url), {
          type: 'module',
        });
        
        // PGliteWorker.create 接受一个标准的 Worker 实例
        const db = (await PGliteWorker.create(worker, {
          extensions: {
            live,
            sync: electricSync(), // 始终包含，但可能不启动
          },
        })) as PGliteWithExtensions
        
        if (!isMounted) return

        // 始终初始化离线同步系统（即使在免费模式下也需要 DatabaseWrapper）
        console.log('Initializing offline sync system...')
        try {
          // 类型转换：PGliteWorker 可以作为 PGlite 使用，因为它实现了相同的接口
          initOfflineSync(db as unknown)
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
        
        // 监听leader变化
        leaderSub = db.onLeaderChange(() => {
          console.log('Leader changed, isLeader:', db.isLeader)
        })
        
      } catch (error) {
        console.error('Failed to initialize PGlite:', error)
        if (isMounted) {
          updateSyncStatus('error', '数据库初始化失败')
        }
      }
    }
    
    init()
    
    return () => {
      isMounted = false
      leaderSub?.()
      // 在组件卸载时终止 worker，防止内存泄漏
      worker?.terminate()
    }
  }, [syncConfig.enabled])
  // 仅在同步启用时启动同步
  useEffect(() => {
    if (pg && syncConfig.enabled) {
      console.log('启动同步功能...')
      startSync(pg).catch(error => {
        console.error('同步启动失败:', error)
        // 不改变用户设置，只是记录错误
        // 同步系统会在内部处理网络错误和重试
      })
    } else if (pg && !syncConfig.enabled) {
      console.log(`同步功能已禁用: ${syncConfig.reason}`)
      // 设置本地模式状态
      updateSyncStatus('done', getSyncDisabledMessage(syncConfig.reason))
    }
  }, [pg, syncConfig])
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