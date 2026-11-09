import { readdir } from 'node:fs/promises'
import path from 'node:path'

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
