'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  clearAIConfig,
  getAIConfig,
  getAIErrorMessage,
  saveAIConfig,
  testAIConnection,
  validateAIConfig,
  type AIConfig,
} from '@/lib/ai'

type ConnectionState = 'idle' | 'testing' | 'success' | 'error'

const EMPTY_CONFIG: AIConfig = {
  endpoint: '',
  apiKey: '',
  model: '',
}

export default function AISettings() {
  const [config, setConfig] = useState<AIConfig>(EMPTY_CONFIG)
  const [isSaved, setIsSaved] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [statusMessage, setStatusMessage] = useState('尚未配置 AI 服务')
  const testControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const savedConfig = getAIConfig()
    if (savedConfig) {
      setConfig(savedConfig)
      setIsSaved(true)
      setStatusMessage('配置已保存在此浏览器')
    }

    return () => testControllerRef.current?.abort()
  }, [])

  const updateConfig = (field: keyof AIConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }))
    setConnectionState('idle')
    setStatusMessage(isSaved ? '配置有未保存的修改' : '尚未保存配置')
  }

  const handleSave = () => {
    const validation = validateAIConfig(config)
    if (!validation.valid || !validation.config) {
      setConnectionState('error')
      setStatusMessage(validation.message ?? 'AI 配置无效')
      toast.error(validation.message ?? 'AI 配置无效')
      return
    }

    const normalized = saveAIConfig(validation.config)
    setConfig(normalized)
    setIsSaved(true)
    setConnectionState('success')
    setStatusMessage('配置已保存在此浏览器')
    toast.success('AI 服务配置已保存')
  }

  const handleTest = async () => {
    const validation = validateAIConfig(config)
    if (!validation.valid || !validation.config) {
      setConnectionState('error')
      setStatusMessage(validation.message ?? 'AI 配置无效')
      toast.error(validation.message ?? 'AI 配置无效')
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setConnectionState('error')
      setStatusMessage('当前处于离线状态，无法测试连接')
      toast.error('当前处于离线状态，无法测试连接')
      return
    }

    testControllerRef.current?.abort()
    const controller = new AbortController()
    testControllerRef.current = controller
    setConnectionState('testing')
    setStatusMessage('正在测试连接…')

    try {
      await testAIConnection(validation.config, controller.signal)
      if (testControllerRef.current !== controller) return
      setConnectionState('success')
      setStatusMessage('连接成功，可以使用 AI 任务拆解')
      toast.success('AI 服务连接成功')
    } catch (error) {
      if (controller.signal.aborted) return
      const message = getAIErrorMessage(error)
      setConnectionState('error')
      setStatusMessage(message)
      toast.error(message)
    } finally {
      if (testControllerRef.current === controller) {
        testControllerRef.current = null
      }
    }
  }

  const handleClear = () => {
    testControllerRef.current?.abort()
    testControllerRef.current = null
    clearAIConfig()
    setConfig(EMPTY_CONFIG)
    setIsSaved(false)
    setConnectionState('idle')
    setStatusMessage('AI 服务配置已清除')
    toast.success('AI 服务配置已清除')
  }

  const statusClass = connectionState === 'error'
    ? 'text-[oklch(var(--destructive))]'
    : connectionState === 'success'
      ? 'text-[oklch(var(--foreground))]'
      : 'text-[oklch(var(--muted-foreground))]'

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[oklch(var(--foreground))]">AI 服务</h2>
        <p className="text-xs leading-5 text-[oklch(var(--muted-foreground))]">
          配置一个兼容 OpenAI Chat Completions 的完整接口地址。
        </p>
      </div>

      <div
        role="status"
        aria-live="polite"
        className={`rounded-md border border-[oklch(var(--border))] px-3 py-2 text-xs ${statusClass}`}
      >
        {statusMessage}
      </div>

      <div className="space-y-2">
        <label htmlFor="ai-endpoint" className="text-sm font-medium text-[oklch(var(--foreground))]">
          API Endpoint
        </label>
        <Input
          id="ai-endpoint"
          type="url"
          value={config.endpoint}
          onChange={(event) => updateConfig('endpoint', event.target.value)}
          placeholder="https://api.example.com/v1/chat/completions"
          autoComplete="url"
          spellCheck={false}
        />
        <p className="text-xs leading-5 text-[oklch(var(--muted-foreground))]">
          请填写完整的 Chat Completions URL；除本机地址外必须使用 HTTPS。
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="ai-api-key" className="text-sm font-medium text-[oklch(var(--foreground))]">
          API Key <span className="font-normal text-[oklch(var(--muted-foreground))]">（可选）</span>
        </label>
        <Input
          id="ai-api-key"
          type="password"
          value={config.apiKey}
          onChange={(event) => updateConfig('apiKey', event.target.value)}
          placeholder="sk-..."
          autoComplete="new-password"
          spellCheck={false}
        />
        <p className="text-xs leading-5 text-[oklch(var(--muted-foreground))]">
          本地模型不需要鉴权时可以留空。
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="ai-model" className="text-sm font-medium text-[oklch(var(--foreground))]">
          Model
        </label>
        <Input
          id="ai-model"
          value={config.model}
          onChange={(event) => updateConfig('model', event.target.value)}
          placeholder="gpt-4.1-mini"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="rounded-md border border-[oklch(var(--border))] bg-[oklch(var(--muted)/0.35)] p-3">
        <p className="text-xs leading-5 text-[oklch(var(--muted-foreground))]">
          只有点击任务备注中的 magic 按钮时，任务标题、人工备注、清单、目标和日期才会发送到这个服务。
          配置仅保存在当前浏览器，不参与同步或数据备份；API Key 未加密，同源前端代码可以读取。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={connectionState === 'testing'}
        >
          {connectionState === 'testing' ? '测试中…' : '测试连接'}
        </Button>
        <Button type="button" onClick={handleSave}>保存配置</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClear}
          disabled={!isSaved && !config.endpoint && !config.apiKey && !config.model}
        >
          清除配置
        </Button>
      </div>
    </div>
  )
}
