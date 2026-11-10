import { app, ipcMain, safeStorage, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { cpus, freemem, totalmem } from 'node:os'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { executeStructuredCommand } from '../core/commands'
import { resolveHomePath } from '../core/path'
import { previewKind, previewUrl, type PreviewKind } from '../core/preview/kind'
import { currentPlatform, resolveStructured } from '../core/structured'
import { isSafeBranchName, parseGitStatus, summarizeNumstat } from '../core/workspace/git'
import { sanitizeStoredWorkspace, type StoredGroup, type StoredSession } from '../core/workspace/stored'

const execFileAsync = promisify(execFile)

interface AiConfig {
  provider: 'local' | 'api'
  endpoint: string
  model: string
  apiKey?: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CpuSnapshot {
  idle: number
  total: number
}

const aiConfigs = new Map<number, AiConfig>()
let persistedAi: AiConfig | null = null

function aiConfigFile(): string {
  return join(app.getPath('userData'), 'ai-config.json')
}

function sealSecret(value: string): string {
  const buffer = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value)
    : Buffer.from(value, 'utf8')
  return buffer.toString('base64')
}

function openSecret(value: string, sealed: boolean): string {
  const buffer = Buffer.from(value, 'base64')
  if (sealed && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buffer)
  return buffer.toString('utf8')
}

async function readPersistedAi(): Promise<AiConfig | null> {
  try {
    const raw = JSON.parse(await readFile(aiConfigFile(), 'utf8')) as {
      provider?: string
      endpoint?: string
      model?: string
      apiKey?: string
      sealed?: boolean
    }
    if (raw.provider !== 'local' && raw.provider !== 'api') return null
    const endpoint = normalizeEndpoint(String(raw.endpoint ?? ''))
    const model = String(raw.model ?? '').trim()
    if (!model) return null
    const apiKey = raw.apiKey ? openSecret(raw.apiKey, raw.sealed === true) : undefined
    return { provider: raw.provider, endpoint, model, ...(apiKey ? { apiKey } : {}) }
  } catch {
    return null
  }
}

async function writePersistedAi(config: AiConfig): Promise<void> {
  await writeFile(
    aiConfigFile(),
    JSON.stringify({
      provider: config.provider,
      endpoint: config.endpoint,
      model: config.model,
      sealed: Boolean(config.apiKey) && safeStorage.isEncryptionAvailable(),
      ...(config.apiKey ? { apiKey: sealSecret(config.apiKey) } : {})
    })
  )
}
const cpuSnapshots = new Map<number, CpuSnapshot>()

function normalizeEndpoint(endpoint: string): string {
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AI 服务地址只支持 HTTP 或 HTTPS')
  }
  const base = url.toString().replace(/\/$/, '')
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

function readCpuSnapshot(): CpuSnapshot {
  return cpus().reduce(
    (result, cpu) => {
      const values = Object.values(cpu.times)
      result.idle += cpu.times.idle
      result.total += values.reduce((sum, value) => sum + value, 0)
      return result
    },
    { idle: 0, total: 0 }
  )
}

function cpuUsage(webContentsId: number): number {
  const current = readCpuSnapshot()
  const previous = cpuSnapshots.get(webContentsId)
  cpuSnapshots.set(webContentsId, current)
  if (!previous) return 0
  const idle = current.idle - previous.idle
  const total = current.total - previous.total
  return total > 0 ? Math.max(0, Math.min(100, 100 - (idle / total) * 100)) : 0
}

async function readGpuUsage(): Promise<{ name: string; usage: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,utilization.gpu', '--format=csv,noheader,nounits'],
      { timeout: 1500 }
    )
    const first = stdout.trim().split(/\r?\n/, 1)[0]
    if (!first) return null
    const separator = first.lastIndexOf(',')
    const usage = Number(first.slice(separator + 1).trim())
    return {
      name: first.slice(0, separator).trim() || 'NVIDIA GPU',
      usage: Number.isFinite(usage) ? usage : 0
    }
  } catch {
    return null
  }
}

const TEXT_PREVIEW_LIMIT = 512 * 1024

export type { StoredGroup, StoredSession }
export { sanitizeStoredWorkspace }

async function gitOutput(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { timeout: 1500 })
    return stdout
  } catch {
    return null
  }
}

async function nodeVersionLabel(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('node', ['--version'], { timeout: 800 })
    const version = stdout.trim()
    return version ? `Node ${version.startsWith('v') ? version : `v${version}`}` : 'Node --'
  } catch {
    return `Node ${process.version}`
  }
}

async function listNodeRuntimes(): Promise<Array<{ version: string; source: string; binDir: string; current: boolean }>> {
  const current = (await nodeVersionLabel()).replace(/^Node\s+v?/, '')
  const found: Array<{ version: string; source: string; binDir: string; current: boolean }> = []
  const seen = new Set<string>()
  const roots = [
    { source: 'nvm', root: join(homedir(), '.nvm', 'versions', 'node'), bin: 'bin' },
    { source: 'fnm', root: join(homedir(), 'Library', 'Application Support', 'fnm', 'node-versions'), bin: join('installation', 'bin') },
    { source: 'fnm', root: join(homedir(), '.local', 'share', 'fnm', 'node-versions'), bin: join('installation', 'bin') },
    { source: 'volta', root: join(homedir(), '.volta', 'tools', 'image', 'node'), bin: 'bin' }
  ]
  for (const place of roots) {
    let names: string[] = []
    try {
      names = await readdir(place.root)
    } catch {
      continue
    }
    for (const name of names.slice(0, 16)) {
      const version = name.replace(/^v/, '')
      if (!/^\d+\.\d+\.\d+/.test(version)) continue
      const binDir = join(place.root, name, place.bin)
      const binary = join(binDir, process.platform === 'win32' ? 'node.exe' : 'node')
      try {
        await stat(binary)
      } catch {
        continue
      }
      const key = `${version}:${binDir}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ version, source: place.source, binDir, current: version === current })
    }
  }
  found.sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }))
  if (!found.some((item) => item.current) && current && current !== '--') {
    found.unshift({ version: current, source: 'PATH', binDir: '', current: true })
  }
  return found.slice(0, 12)
}

export function registerWorkspaceIpc(
  isTrustedSender: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean
): void {
  ipcMain.handle('ai:load', async (event) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的 AI 配置请求')
    persistedAi ??= await readPersistedAi()
    if (!persistedAi) return null
    aiConfigs.set(event.sender.id, { ...persistedAi })
    return persistedAi
  })

  ipcMain.handle('ai:configure', async (event, config: AiConfig) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的 AI 配置请求')
    if (!config || !['local', 'api'].includes(config.provider)) throw new Error('无效的 AI 模式')
    const endpoint = normalizeEndpoint(String(config.endpoint ?? ''))
    const model = String(config.model ?? '').trim()
    if (!model) throw new Error('请填写 AI 模型名称')
    persistedAi ??= await readPersistedAi()
    const apiKey = config.apiKey !== undefined ? String(config.apiKey).trim() : persistedAi?.apiKey ?? ''
    const next: AiConfig = {
      provider: config.provider,
      endpoint,
      model,
      ...(apiKey ? { apiKey } : {})
    }
    persistedAi = next
    aiConfigs.set(event.sender.id, next)
    await writePersistedAi(next)
    return { configured: true }
  })

  ipcMain.handle('ai:chat', async (event, messages: ChatMessage[]) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的 AI 请求')
    const config = aiConfigs.get(event.sender.id)
    if (!config) throw new Error('请先配置 AI 服务')
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      throw new Error('无效的对话消息')
    }
    const safeMessages = messages.map((message) => ({
      role: message.role,
      content: String(message.content ?? '').slice(0, 20_000)
    }))
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({ model: config.model, messages: safeMessages, stream: false }),
      signal: AbortSignal.timeout(60_000)
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      throw new Error(`AI 请求失败 (${response.status}): ${detail}`)
    }
    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = result.choices?.[0]?.message?.content
    if (!content) throw new Error('AI 服务未返回有效内容')
    return { content }
  })

  ipcMain.on(
    'ai:chat-stream',
    (
      event,
      payload: { requestId: string; messages: ChatMessage[] }
    ) => {
      if (!isTrustedSender(event)) return
      const send = (type: 'chunk' | 'done' | 'error', content = ''): void => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('ai:stream', { requestId: payload.requestId, type, content })
        }
      }

      void (async () => {
        try {
          const config = aiConfigs.get(event.sender.id)
          if (!config) throw new Error('请先在设置中保存 AI 配置')
          if (
            !Array.isArray(payload.messages) ||
            payload.messages.length === 0 ||
            payload.messages.length > 40
          ) {
            throw new Error('无效的对话消息')
          }
          const messages = payload.messages.map((message) => ({
            role: message.role,
            content: String(message.content ?? '').slice(0, 20_000)
          }))
          const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
            },
            body: JSON.stringify({ model: config.model, messages, stream: true }),
            signal: AbortSignal.timeout(60_000)
          })
          if (!response.ok) {
            const detail = (await response.text()).slice(0, 300)
            if (response.status === 401 || response.status === 403) {
              throw new Error('AI 鉴权失败，请检查 API Key 是否正确或已过期')
            }
            throw new Error(`AI 请求失败 (${response.status})${detail ? `：${detail}` : ''}`)
          }

          if (!response.body) throw new Error('AI 服务未返回可读取的数据流')
          const contentType = response.headers.get('content-type') ?? ''
          if (!contentType.includes('text/event-stream')) {
            const result = (await response.json()) as {
              choices?: Array<{ message?: { content?: string } }>
            }
            const content = result.choices?.[0]?.message?.content
            if (!content) throw new Error('AI 服务未返回有效内容')
            send('chunk', content)
            send('done')
            return
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const data = line.slice(5).trim()
              if (!data || data === '[DONE]') continue
              try {
                const packet = JSON.parse(data) as {
                  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
                }
                const chunk =
                  packet.choices?.[0]?.delta?.content ??
                  packet.choices?.[0]?.message?.content ??
                  ''
                if (chunk) send('chunk', chunk)
              } catch {
                // Ignore malformed keep-alive packets from compatible providers.
              }
            }
          }
          send('done')
        } catch (error) {
          send('error', error instanceof Error ? error.message : String(error))
        }
      })()
    }
  )

  ipcMain.handle('system:metrics', async (event) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的系统指标请求')
    const gpu = await readGpuUsage()
    return {
      processor: gpu
        ? { kind: 'gpu', name: gpu.name, usage: gpu.usage }
        : { kind: 'cpu', name: 'CPU（未检测到 NVIDIA GPU）', usage: cpuUsage(event.sender.id) },
      memory: {
        used: totalmem() - freemem(),
        total: totalmem()
      },
      timestamp: Date.now()
    }
  })

  ipcMain.handle('files:list', async (event, requested?: string) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的文件请求')
    const directory = resolveHomePath(requested)
    const directoryStat = await stat(directory)
    if (!directoryStat.isDirectory()) throw new Error('目标不是目录')
    const entries = await readdir(directory, { withFileTypes: true })
    const items = await Promise.all(
      entries.slice(0, 300).map(async (entry) => {
        const fullPath = join(directory, entry.name)
        const details = await stat(fullPath).catch(() => null)
        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
          size: details?.size ?? 0,
          modifiedAt: details?.mtimeMs ?? 0
        }
      })
    )
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    const home = resolve(homedir())
    return {
      path: directory,
      parent: directory === home ? null : resolve(directory, '..'),
      items
    }
  })

  ipcMain.handle('files:preview', async (event, requested?: string) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的文件请求')
    const filePath = resolveHomePath(requested)
    const details = await stat(filePath)
    if (!details.isFile()) throw new Error('只能预览文件')
    const name = basename(filePath)
    const kind: PreviewKind = previewKind(name)
    if (kind === 'none') return { path: filePath, name, kind, message: '这个类型暂不能在面板里预览' }
    if (kind === 'image' || kind === 'video' || kind === 'pdf') {
      if (details.size > 20 * 1024 * 1024) {
        return { path: filePath, name, kind, message: '文件超过 20MB，无法在面板中预览' }
      }
      return { path: filePath, name, kind, url: previewUrl(filePath) }
    }
    if (details.size > TEXT_PREVIEW_LIMIT) {
      return { path: filePath, name, kind, message: '文本超过 512KB，无法在面板中完整预览' }
    }
    const text = await readFile(filePath, 'utf8')
    return { path: filePath, name, kind, text }
  })

  ipcMain.handle(
    'commands:structured',
    async (
      event,
      request: { command: string; args: string[]; cwd?: string }
    ) => {
      if (!isTrustedSender(event)) throw new Error('拒绝不受信任的结构化命令请求')
      const command = String(request?.command ?? '').toLowerCase()
      const args = Array.isArray(request?.args)
        ? request.args.slice(0, 100).map((arg) => String(arg).slice(0, 2_000))
        : []
      if (!resolveStructured(command, args, currentPlatform())) {
        throw new Error('不支持的结构化命令')
      }
      const cwd = resolveHomePath(request?.cwd)
      return executeStructuredCommand(command, args, cwd)
    }
  )

  ipcMain.handle('workspace:context', async (event, directory?: string) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的工作区请求')
    const cwd = resolveHomePath(typeof directory === 'string' ? directory : undefined)
    const [runtime, branchResult, statusResult, diffResult] = await Promise.all([
      nodeVersionLabel(),
      gitOutput(cwd, ['branch', '--show-current']),
      gitOutput(cwd, ['status', '--porcelain', '-z']),
      gitOutput(cwd, ['diff', '--numstat', 'HEAD'])
    ])
    const files = statusResult ? parseGitStatus(statusResult) : []
    const summary = diffResult ? summarizeNumstat(diffResult) : { insertions: 0, deletions: 0 }
    return {
      runtime,
      directory: cwd,
      branch: branchResult?.trim() || null,
      changes: files.length,
      insertions: summary.insertions,
      deletions: summary.deletions
    }
  })

  ipcMain.handle('workspace:git', async (event, directory?: string) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的工作区请求')
    const cwd = resolveHomePath(typeof directory === 'string' ? directory : undefined)
    const [branchResult, branchesResult, statusResult, diffResult] = await Promise.all([
      gitOutput(cwd, ['branch', '--show-current']),
      gitOutput(cwd, ['branch', '--format=%(refname:short)']),
      gitOutput(cwd, ['status', '--porcelain', '-z']),
      gitOutput(cwd, ['diff', '--numstat', 'HEAD'])
    ])
    const summary = diffResult ? summarizeNumstat(diffResult) : { insertions: 0, deletions: 0 }
    const files = statusResult ? parseGitStatus(statusResult) : []
    return {
      directory: cwd,
      branch: branchResult?.trim() || null,
      branches: (branchesResult ?? '')
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(isSafeBranchName)
        .slice(0, 80),
      changes: files.length,
      insertions: summary.insertions,
      deletions: summary.deletions,
      files
    }
  })

  ipcMain.handle('workspace:nodes', async (event) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的工作区请求')
    return listNodeRuntimes()
  })
}
