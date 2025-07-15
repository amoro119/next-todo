// app/electric-client-provider.tsx
'use client'

import React, { createContext, useContext, useMemo } from 'react';

// 定义通过 IPC 暴露的数据库 API 的类型
// 这有助于在 TypeScript 中获得类型安全
interface DatabaseAPI {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>;
  exec: (sql: string) => Promise<any>;
  transaction: (queries: { sql: string, params?: any[] }[]) => Promise<any>;
}

// 创建一个全局可用的数据库代理对象
// 它会检查 'window.electron' 是否存在，如果不存在则提供一个安全的空实现
// 这样代码在浏览器或没有预加载脚本的环境中也不会崩溃
const dbProxy: DatabaseAPI = (typeof window !== 'undefined' && (window as any).electron)
  ? (window as any).electron.db
  : {
      query: async () => { console.warn('DB not available'); return { rows: [] }; },
      exec: async () => { console.warn('DB not available'); return {}; },
      transaction: async () => { console.warn('DB not available'); return []; },
    };

// 创建数据库上下文
const DbContext = createContext<DatabaseAPI | null>(null);

// 自定义 Hook，方便在组件中获取数据库实例
export const useDb = () => {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error('useDb must be used within a DbProvider');
  }
  return context;
};

// 新的 Provider 组件
export default function DbProvider({ children }: { children: React.ReactNode }) {
  // useMemo 确保 dbProxy 对象在组件重新渲染时保持不变
  const db = useMemo(() => dbProxy, []);

  // 这里不再需要复杂的加载状态，因为数据库连接在主进程中处理。
  // 渲染进程可以立即开始发送请求。
  return (
    <DbContext.Provider value={db}>
      {children}
    </DbContext.Provider>
  );
}