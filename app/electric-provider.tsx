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

// 临时内联函数，避免导入问题
const isSyncConfigEqual = (a: SyncConfig, b: SyncConfig): boolean => {
  return a.enabled === b.enabled && a.reason === b.reason;
};
import { startupOptimizer, initializeStartupOptimization } from '../lib/performance/startupOptimizer'
import { trackCall } from '../lib/debug/initializationTracker'

// 全局标志防止重复初始化
let isDbInitializationStarted = false;

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
  
  // 调试：跟踪组件渲染（仅在开发模式下）
  if (process.env.NODE_ENV === 'development') {
    console.log('🔄 ElectricProvider 渲染，pg:', !!pg, 'syncConfig:', syncConfig);
  }
  // 检查同步配置并监听变化（只执行一次）
  useEffect(() => {
    let isInitialized = false;
    
    // 启动性能优化
    initializeStartupOptimization();
    
    const updateConfig = () => {
      const config = getSyncConfig()
      
      // 只有在配置真正变化时才更新状态
      setSyncConfig(prevConfig => {
        if (!isSyncConfigEqual(prevConfig, config)) {
          if (!isInitialized) {
            console.log('同步配置初始化:', config)
            isInitialized = true;
          } else {
            console.log('同步配置更新:', config)
          }
          return config;
        }
        return prevConfig;
      });
    }

    // 优化：初始化应用配置
    const initConfig = async () => {
      const configStartTime = performance.now();
      try {
        await initializeAppConfig()
        startupOptimizer.recordMetric('configInit', configStartTime);
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
      trackCall('ElectricProvider.dbInit');
      
      if (isDbInitializationStarted) {
        console.log('🔄 数据库初始化已开始，跳过重复调用');
        return;
      }
      
      isDbInitializationStarted = true;
      const dbStartTime = performance.now();
      
      try {
        // 优化：并行创建worker和预加载模块
        const [workerInstance] = await Promise.all([
          new Promise<Worker>((resolve) => {
            const w = new Worker(new URL('./pglite-worker.ts', import.meta.url), {
              type: 'module',
            });
            resolve(w);
          }),
          // 预加载离线同步模块
          startupOptimizer.getPreloadedModule('migrations').catch(() => null),
        ]);
        
        worker = workerInstance;
        
        // PGliteWorker.create 接受一个标准的 Worker 实例
        const db = (await PGliteWorker.create(worker, {
          extensions: {
            live,
            sync: electricSync(), // 始终包含，但可能不启动
          },
        })) as PGliteWithExtensions
        
        if (!isMounted) return

        // 优化：并行初始化离线同步系统和设置调试接口
        await Promise.all([
          // 始终初始化离线同步系统
          (async () => {
            console.log('Initializing offline sync system...')
            trackCall('initOfflineSync');
            try {
              initOfflineSync(db as unknown)
              console.log('Offline sync system initialized successfully')
            } catch (error) {
              console.error('Failed to initialize offline sync system:', error)
            }
          })(),
          
          // 设置调试接口
          (async () => {
            if (typeof window !== 'undefined') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).pg = db;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (globalThis as any).pg = db;
            }
          })(),
        ]);

        startupOptimizer.recordMetric('dbInit', dbStartTime);
        setPg(db)
        
        // 监听leader变化
        leaderSub = db.onLeaderChange(() => {
          console.log('Leader changed, isLeader:', db.isLeader)
        })
        
      } catch (error) {
        console.error('Failed to initialize PGlite:', error)
        isDbInitializationStarted = false; // 重置标志以允许重试
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
  }, []) // 移除syncConfig.enabled依赖，避免重复初始化
  // 仅在同步启用时启动同步
  useEffect(() => {
    if (pg && syncConfig.enabled) {
      const syncStartTime = performance.now();
      console.log('启动同步功能...')
      startSync(pg).then(() => {
        startupOptimizer.recordMetric('syncInit', syncStartTime);
        // 输出完整的性能报告
        const report = startupOptimizer.getPerformanceReport();
        console.log('🎯 启动性能报告:', report);
        
        // 标记应用已初始化
        startupOptimizer.markAsInitialized();
      }).catch(error => {
        console.error('同步启动失败:', error)
        // 不改变用户设置，只是记录错误
        // 同步系统会在内部处理网络错误和重试
      })
    } else if (pg && !syncConfig.enabled) {
      console.log(`同步功能已禁用: ${syncConfig.reason}`)
      // 设置本地模式状态
      updateSyncStatus('done', getSyncDisabledMessage(syncConfig.reason))
      
      // 即使同步禁用也记录性能
      const report = startupOptimizer.getPerformanceReport();
      console.log('🎯 启动性能报告 (本地模式):', report);
      startupOptimizer.markAsInitialized();
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