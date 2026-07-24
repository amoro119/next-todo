export interface AIConfig {
  endpoint: string
  apiKey: string
  model: string
}

export interface AIConfigValidation {
  valid: boolean
  message?: string
  config?: AIConfig
}

const STORAGE_KEY = 'next-todo:ai-config'
const CHANGE_EVENT = 'aiConfigChanged'

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function normalizeConfig(config: AIConfig): AIConfig {
  return {
    endpoint: config.endpoint.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname === '::1'
}

export function validateAIConfig(config: AIConfig): AIConfigValidation {
  const normalized = normalizeConfig(config)

  if (!normalized.endpoint) {
    return { valid: false, message: '请填写 API Endpoint' }
  }

  if (!normalized.model) {
    return { valid: false, message: '请填写模型名称' }
  }

  let endpoint: URL
  try {
    endpoint = new URL(normalized.endpoint)
  } catch {
    return { valid: false, message: 'API Endpoint 不是有效的网址' }
  }

  const allowedProtocol = endpoint.protocol === 'https:'
    || (endpoint.protocol === 'http:' && isLoopbackHostname(endpoint.hostname))

  if (!allowedProtocol) {
    return {
      valid: false,
      message: 'API Endpoint 必须使用 HTTPS；本机 localhost 或 127.0.0.1 可使用 HTTP',
    }
  }

  return { valid: true, config: normalized }
}

export function getAIConfig(): AIConfig | null {
  if (!hasLocalStorage()) return null

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<AIConfig>
    if (
      typeof parsed.endpoint !== 'string'
      || typeof parsed.apiKey !== 'string'
      || typeof parsed.model !== 'string'
    ) {
      return null
    }

    return normalizeConfig(parsed as AIConfig)
  } catch {
    return null
  }
}

export function saveAIConfig(config: AIConfig): AIConfig {
  const validation = validateAIConfig(config)
  if (!validation.valid || !validation.config) {
    throw new Error(validation.message ?? 'AI 配置无效')
  }

  if (hasLocalStorage()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validation.config))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
    }
  }

  return validation.config
}

export function clearAIConfig(): void {
  if (!hasLocalStorage()) return

  localStorage.removeItem(STORAGE_KEY)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  }
}

export function hasAIConfig(): boolean {
  const config = getAIConfig()
  return !!config && validateAIConfig(config).valid
}

export const AI_CONFIG_STORAGE_KEY = STORAGE_KEY
