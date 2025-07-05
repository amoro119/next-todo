// app/electric-client-provider.tsx
'use client'

import dynamic from 'next/dynamic'
import React from 'react'

// 从 './electric-provider' 导入，因为现在它们在同一个目录下
const ElectricProvider = dynamic(
  () => import('./electric-provider').then((mod) => mod.ElectricProvider),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        <div className="mt-4 text-gray-600">正在准备环境...</div>
      </div>
    ),
  }
)

export default function ElectricClientProvider({ children }: { children: React.ReactNode }) {
  return <ElectricProvider>{children}</ElectricProvider>
}