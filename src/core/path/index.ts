import { readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

function isInsideRoot(root: string, target: string): boolean {
  const relation = path.relative(root, target)
  return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation))
}

async function resolveExistingRealPath(target: string): Promise<string> {
  const pending: string[] = []
  let current = target
  while (true) {
    try {
      const real = await realpath(current)
      return pending.reduceRight((directory, name) => path.resolve(directory, name), real)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      pending.push(path.basename(current))
      current = parent
    }
  }
}

export async function resolveHomePath(requested?: string, root = homedir()): Promise<string> {
  if (requested?.includes('\0')) throw new Error('路径不能包含 NUL 字符')
  const home = await realpath(root)
  const target = path.resolve(
    requested && path.isAbsolute(requested) ? requested : path.join(home, requested ?? '')
  )
  if (!isInsideRoot(home, target)) throw new Error('文件浏览仅允许访问当前用户目录')
  let realTarget: string
  try {
    realTarget = await resolveExistingRealPath(target)
  } catch {
    throw new Error('文件浏览仅允许访问当前用户目录')
  }
  if (!isInsideRoot(home, realTarget)) throw new Error('文件浏览仅允许访问当前用户目录')
  return realTarget
}

export interface NormalizePathOptions {
  cwd: string
  platform?: NodeJS.Platform
}

export function normalizeUserPath(
  input: string,
  { cwd, platform = process.platform }: NormalizePathOptions
): string {
  if (input.includes('\0')) throw new Error('路径不能包含 NUL 字符')
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  let value = input || '.'

  if (platform === 'win32') {
    value = value.replaceAll('/', '\\')
    if (/^\\[^\\]/.test(value)) {
      const drive = path.win32.parse(cwd).root
      value = path.win32.join(drive, value)
    }
  } else {
    value = value.replaceAll('\\', '/')
  }

  return pathApi.normalize(pathApi.isAbsolute(value) ? value : pathApi.resolve(cwd, value))
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replaceAll('*', '.*').replaceAll('?', '.')}$`)
}

export async function expandPathPattern(input: string, cwd: string): Promise<string[]> {
  if (!/[*?]/.test(input)) return [normalizeUserPath(input, { cwd })]

  const normalizedInput = process.platform === 'win32' ? input.replaceAll('/', '\\') : input
  const directoryPart = path.dirname(normalizedInput)
  const basenamePattern = path.basename(normalizedInput)
  if (/[*?]/.test(directoryPart)) {
    throw new Error('M0 glob 暂不支持目录段中的通配符')
  }

  const directory = normalizeUserPath(directoryPart, { cwd })
  const matcher = globToRegExp(basenamePattern)
  const matches = (await readdir(directory))
    .filter((name) => matcher.test(name))
    .map((name) => path.join(directory, name))
    .sort((a, b) => a.localeCompare(b))
  return matches
}
