import { NextRequest, NextResponse } from 'next/server'

const UPSTREAM_TIMEOUT_MS = 50_000
const MAX_MESSAGES = 32
const MAX_MESSAGE_CONTENT_LENGTH = 32_000

interface ProxyMessage {
  role?: unknown
  content?: unknown
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname === '::1'
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: NextRequest) {
  let body: {
    endpoint?: unknown
    apiKey?: unknown
    model?: unknown
    messages?: unknown
  }

  try {
    body = await request.json()
  } catch {
    return jsonError(400, '请求体不是有效 JSON')
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  const messages = Array.isArray(body.messages) ? (body.messages as ProxyMessage[]) : null

  if (!endpoint) {
    return jsonError(400, '缺少 API Endpoint')
  }
  if (!model) {
    return jsonError(400, '缺少模型名称')
  }
  if (
    !messages
    || messages.length === 0
    || messages.length > MAX_MESSAGES
    || messages.some(
      (message) => typeof message?.content !== 'string'
        || message.content.length > MAX_MESSAGE_CONTENT_LENGTH,
    )
  ) {
    return jsonError(400, '消息内容无效')
  }

  let endpointUrl: URL
  try {
    endpointUrl = new URL(endpoint)
  } catch {
    return jsonError(400, 'API Endpoint 不是有效的网址')
  }

  const allowedProtocol = endpointUrl.protocol === 'https:'
    || (endpointUrl.protocol === 'http:' && isLoopbackHostname(endpointUrl.hostname))

  if (!allowedProtocol) {
    return jsonError(400, 'API Endpoint 必须使用 HTTPS；本机地址可使用 HTTP')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const upstream = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: messages.map((message) => ({
          role: message.role === 'system' ? 'system' : 'user',
          content: message.content,
        })),
        stream: false,
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    const text = await upstream.text()

    if (!upstream.ok) {
      return jsonError(upstream.status, `AI 服务返回错误（${upstream.status}）`)
    }

    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return jsonError(502, 'AI 服务返回的内容不是有效 JSON')
    }
  } catch {
    if (controller.signal.aborted) {
      return jsonError(504, 'AI 服务响应超时')
    }
    return jsonError(502, '无法连接 AI 服务')
  } finally {
    clearTimeout(timeout)
  }
}
