import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseSshTarget, type SshTarget } from './target'

const OSC7_SOURCE = '\\x1b\\]7;([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)'
const MAX_UPLOAD_ENTRIES = 5000

function isInsideRoot(root: string, target: string): boolean {
  const relation = path.relative(root, target)
  return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation))
}

export function remoteUploadDirectory(input: string): string | undefined {
  const trimmed = input.trim()
  if (trimmed === '~' || trimmed === '~/') return '~/'
  let value = trimmed
  try {
    value = decodeURIComponent(trimmed)
  } catch {
    value = trimmed
  }
  if (!value.startsWith('/') || value.length > 1024) return undefined
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined
  const parts = value.split('/')
  const body = value.endsWith('/') ? parts.slice(1, -1) : parts.slice(1)
  if (body.length === 0 || body.some((part) => part.length === 0 || part === '.' || part === '..')) return undefined
  if (/[;|&$`<>*?[\]]/.test(value)) return undefined
  return value.endsWith('/') ? value : `${value}/`
}

export function directoryFromOsc7(payload: string): string | undefined {
  const match = /^file:\/\/[^/]*(\/.*)$/.exec(payload.trim())
  if (!match?.[1]) return undefined
  return remoteUploadDirectory(match[1])
}

export function consumeOsc7(pending: string, data: string): { pending: string; directories: string[] } {
  const combined = `${pending}${data}`.slice(-8192)
  const directories: string[] = []
  let last = 0
  for (const match of combined.matchAll(new RegExp(OSC7_SOURCE, 'g'))) {
    const start = match.index ?? 0
    last = start + match[0].length
    const directory = directoryFromOsc7(match[1] ?? '')
    if (directory) directories.push(directory)
  }
  const tail = combined.slice(last)
  const open = tail.lastIndexOf('\x1b]7;')
  return {
    pending: open >= 0 && tail.length - open < 4096 ? tail.slice(open) : '',
    directories
  }
}

export function scpUploadArguments(
  target: SshTarget,
  localPath: string,
  remoteDirectory: string,
  kind: 'file' | 'directory'
): string[] {
  const parsed = parseSshTarget(
    `${target.user ? `${target.user}@` : ''}${target.host}${target.port === 22 ? '' : `:${target.port}`}`
  )
  if (!parsed || parsed.host !== target.host || parsed.port !== target.port || parsed.user !== target.user) {
    throw new Error('SSH 目标无效')
  }
  const remote = remoteUploadDirectory(remoteDirectory)
  if (!remote) throw new Error('远程目录无效')
  const destination = parsed.user ? `${parsed.user}@${parsed.host}` : parsed.host
  return [
    ...(kind === 'directory' ? ['-r'] : []),
    '-P',
    String(parsed.port),
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=12',
    '--',
    localPath,
    `${destination}:${remote}`
  ]
}

export function explainScpFailure(text: string): string {
  if (/ENOENT|not found|不是内部或外部命令/i.test(text)) return '本机没有可用的 scp，无法上传'
  if (/timeout|ETIMEDOUT/i.test(text)) return '上传超时'
  if (/Permission denied|Authentication|Host key verification failed/i.test(text)) {
    return '上传需要本机已配置的 SSH 密钥或 ssh-agent，密码登录不能用于拖放上传'
  }
  const detail = text.replace(/\s+/g, ' ').trim().slice(0, 240)
  return detail ? `上传失败：${detail}` : '上传失败'
}

export async function inspectUploadTree(realPath: string, home: string): Promise<'file' | 'directory'> {
  if (!isInsideRoot(home, realPath)) throw new Error('只能上传当前用户目录中的文件或文件夹')
  const rootStat = await lstat(realPath)
  if (rootStat.isSymbolicLink()) {
    const target = await realpath(realPath)
    if (!isInsideRoot(home, target)) throw new Error('只能上传当前用户目录中的文件或文件夹')
    return inspectUploadTree(target, home)
  }
  if (rootStat.isFile()) return 'file'
  if (!rootStat.isDirectory()) throw new Error('只能上传文件或文件夹')

  const seen = new Set<string>([realPath])
  let count = 0
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      count += 1
      if (count > MAX_UPLOAD_ENTRIES) throw new Error('文件夹内条目超过 5000，未上传')
      const full = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        let target: string
        try {
          target = await realpath(full)
        } catch {
          throw new Error('文件夹包含无法解析的符号链接')
        }
        if (!isInsideRoot(home, target)) throw new Error('文件夹包含指向用户目录之外的符号链接')
        if (seen.has(target)) continue
        const targetStat = await stat(full)
        if (targetStat.isDirectory()) {
          seen.add(target)
          await walk(target)
        }
        continue
      }
      if (entry.isDirectory()) await walk(full)
    }
  }
  await walk(realPath)
  return 'directory'
}

export async function uploadLocalPaths(options: {
  target: SshTarget
  localPaths: readonly string[]
  remoteDirectory: string
  remoteKnown: boolean
  home: string
  resolvePath: (requested: string) => Promise<string>
  run: (args: string[]) => Promise<void>
}): Promise<{ message: string }> {
  if (options.localPaths.length === 0 || options.localPaths.length > 20) {
    throw new Error('一次最多上传 20 个文件或文件夹')
  }
  const remote = remoteUploadDirectory(options.remoteDirectory)
  if (!remote) throw new Error('远程目录无效')
  const names: string[] = []
  for (const requested of options.localPaths) {
    const realPath = await options.resolvePath(requested)
    const kind = await inspectUploadTree(realPath, options.home)
    try {
      await options.run(scpUploadArguments(options.target, realPath, remote, kind))
    } catch (error) {
      const reason = explainScpFailure(error instanceof Error ? error.message : String(error))
      if (names.length === 0) throw new Error(reason)
      throw new Error(`已上传 ${names.join('、')}，随后${reason}`)
    }
    names.push(path.basename(realPath))
  }
  const host = options.target.user ? `${options.target.user}@${options.target.host}` : options.target.host
  const where = options.remoteKnown
    ? `${host}:${remote}`
    : `${host}:${remote}（尚未获得远程当前目录，已上传到家目录）`
  return { message: `已上传 ${names.join('、')} 到 ${where}` }
}
