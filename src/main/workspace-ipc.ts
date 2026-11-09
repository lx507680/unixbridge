import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { cpus, freemem, homedir, totalmem } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

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

function resolveSafePath(requested?: string): string {
  const home = resolve(homedir())
  const target = resolve(requested && isAbsolute(requested) ? requested : join(home, requested ?? ''))
  const relation = relative(home, target)
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error('文件浏览仅允许访问当前用户目录')
  }
  return target
}

export function registerWorkspaceIpc(
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  ipcMain.handle('ai:configure', (event, config: AiConfig) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的 AI 配置请求')
    if (!config || !['local', 'api'].includes(config.provider)) throw new Error('无效的 AI 模式')
    const endpoint = normalizeEndpoint(String(config.endpoint ?? ''))
    const model = String(config.model ?? '').trim()
    if (!model) throw new Error('请填写 AI 模型名称')
    aiConfigs.set(event.sender.id, {
      provider: config.provider,
      endpoint,
      model,
      ...(config.apiKey ? { apiKey: String(config.apiKey) } : {})
    })
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
    const directory = resolveSafePath(requested)
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

  ipcMain.handle('workspace:context', async (event) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的工作区请求')
    const cwd = process.env.USERPROFILE ?? process.env.HOME ?? process.cwd()
    const [branchResult, statusResult] = await Promise.all([
      execFileAsync('git', ['-C', cwd, 'branch', '--show-current'], { timeout: 1500 }).catch(
        () => null
      ),
      execFileAsync('git', ['-C', cwd, 'status', '--porcelain'], { timeout: 1500 }).catch(
        () => null
      )
    ])
    const changes = statusResult?.stdout.trim()
      ? statusResult.stdout.trim().split(/\r?\n/).length
      : 0
    return {
      runtime: `Node ${process.version}`,
      directory: cwd,
      branch: branchResult?.stdout.trim() || null,
      changes
    }
  })
}
