import type { AiConfig } from '../../shared/types'

function ipv4Parts(hostname: string): number[] | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!match) return undefined
  const parts = [match[1], match[2], match[3], match[4]].map((part) => Number(part))
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined
  return parts
}

export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    host === '::' ||
    host === '0.0.0.0'
  ) {
    return true
  }
  const parts = ipv4Parts(host)
  if (!parts) {
    return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')
  }
  const [first, second] = parts
  if (first === undefined || second === undefined) return true
  if (first === 10 || first === 127 || first === 0) return true
  if (first === 169 && second === 254) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 168) return true
  if (first === 100 && second >= 64 && second <= 127) return true
  return false
}

export function normalizeAiEndpoint(endpoint: string, provider: AiConfig['provider']): string {
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AI 服务地址只支持 HTTP 或 HTTPS')
  }
  if (url.username || url.password) {
    throw new Error('AI 服务地址不能包含用户名或密码')
  }
  if (provider === 'api' && isPrivateOrLocalHost(url.hostname)) {
    throw new Error('API 模式不允许把密钥发往本机或内网地址')
  }
  const base = url.toString().replace(/\/$/, '')
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}
