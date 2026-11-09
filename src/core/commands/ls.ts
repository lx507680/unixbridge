import { lstat, readdir } from 'node:fs/promises'
import { userInfo } from 'node:os'
import path from 'node:path'
import { expandPathPattern } from '../path'
import type {
  CommandContext,
  CommandDefinition,
  CommandInvocation,
  CommandResult
} from './types'

export interface LsRow {
  mode: string
  links: number
  owner: string
  group: string
  size: number
  displaySize: string
  mtime: string
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  depth: number
}

export interface LsOptions {
  all: boolean
  long: boolean
  humanReadable: boolean
  recursive: boolean
  appendDirectorySlash: boolean
}

export interface LsExecution {
  rows: LsRow[]
  total: number
  errors: string[]
  options: LsOptions
}

const DEFAULT_OPTIONS: LsOptions = {
  all: false,
  long: false,
  humanReadable: false,
  recursive: false,
  appendDirectorySlash: true
}

function parseLsArgs(args: string[]): { options: LsOptions; paths: string[] } {
  const options = { ...DEFAULT_OPTIONS }
  const paths: string[] = []
  let parseFlags = true

  for (const arg of args) {
    if (parseFlags && arg === '--') {
      parseFlags = false
      continue
    }
    if (parseFlags && arg.startsWith('--')) {
      switch (arg) {
        case '--all':
          options.all = true
          break
        case '--long':
          options.long = true
          break
        case '--human-readable':
          options.humanReadable = true
          break
        case '--recursive':
          options.recursive = true
          break
        default:
          throw new Error(`ls: 不支持的选项 ${arg}`)
      }
      continue
    }
    if (parseFlags && /^-[^-]/.test(arg)) {
      for (const flag of arg.slice(1)) {
        if (flag === 'a') options.all = true
        else if (flag === 'l') options.long = true
        else if (flag === 'h') options.humanReadable = true
        else if (flag === 'R') options.recursive = true
        else throw new Error(`ls: 不支持的选项 -${flag}`)
      }
      continue
    }
    paths.push(arg)
  }
  return { options, paths: paths.length > 0 ? paths : ['.'] }
}

function fileType(stats: Awaited<ReturnType<typeof lstat>>): LsRow['type'] {
  if (stats.isSymbolicLink()) return 'symlink'
  if (stats.isDirectory()) return 'directory'
  if (stats.isFile()) return 'file'
  return 'other'
}

function modeString(stats: Awaited<ReturnType<typeof lstat>>): string {
  const prefix = stats.isDirectory() ? 'd' : stats.isSymbolicLink() ? 'l' : '-'
  const masks = [
    0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001
  ] as const
  const chars = ['r', 'w', 'x', 'r', 'w', 'x', 'r', 'w', 'x'] as const
  // TODO(Windows): NTFS ACL cannot be represented faithfully as POSIX rwx bits.
  const mode = Number(stats.mode)
  return prefix + masks.map((mask, index) => (mode & mask ? chars[index] : '-')).join('')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}`
  const units = ['K', 'M', 'G', 'T']
  let value = bytes
  let unit = ''
  for (const candidate of units) {
    value /= 1024
    unit = candidate
    if (value < 1024) break
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}${unit}`
}

function formatMtime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

async function createRow(
  absolutePath: string,
  displayName: string,
  depth: number,
  options: LsOptions
): Promise<LsRow> {
  const stats = await lstat(absolutePath)
  const type = fileType(stats)
  const owner = process.env.USERNAME ?? process.env.USER ?? userInfo().username ?? 'user'
  // TODO(Windows): resolve owner/group from ACL/SID without making ls fail on access denial.
  const group = process.platform === 'win32' ? 'BUILTIN\\Administrators' : 'group'
  const name =
    type === 'directory' && options.appendDirectorySlash && !displayName.endsWith('/')
      ? `${displayName}/`
      : displayName
  return {
    mode: modeString(stats),
    links: Math.max(1, stats.nlink),
    owner,
    group,
    size: stats.size,
    displaySize: options.humanReadable ? formatSize(stats.size) : String(stats.size),
    mtime: formatMtime(stats.mtime),
    name,
    path: absolutePath,
    type,
    depth
  }
}

async function listDirectory(
  directory: string,
  options: LsOptions,
  depth: number,
  rows: LsRow[],
  errors: string[],
  visited: Set<string>
): Promise<void> {
  const realKey = path.resolve(directory).toLowerCase()
  if (visited.has(realKey)) return
  visited.add(realKey)

  const entries = await readdir(directory, { withFileTypes: true })
  const names = entries
    .filter((entry) => options.all || !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
  if (options.all) names.unshift('.', '..')

  for (const name of names) {
    const absolutePath = path.resolve(directory, name)
    try {
      rows.push(await createRow(absolutePath, name, depth, options))
    } catch (error) {
      errors.push(`ls: ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!options.recursive) return
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.' || entry.name === '..') continue
    if (!options.all && entry.name.startsWith('.')) continue
    try {
      await listDirectory(
        path.join(directory, entry.name),
        options,
        depth + 1,
        rows,
        errors,
        visited
      )
    } catch (error) {
      errors.push(
        `ls: ${path.join(directory, entry.name)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
}

export async function executeLs(
  args: string[],
  cwd: string,
  signal?: AbortSignal
): Promise<LsExecution> {
  const { options, paths } = parseLsArgs(args)
  const rows: LsRow[] = []
  const errors: string[] = []
  const expandedPaths: string[] = []
  for (const requestedPath of paths) {
    if (signal?.aborted) throw signal.reason
    try {
      const expanded = await expandPathPattern(requestedPath, cwd)
      if (expanded.length === 0) errors.push(`ls: ${requestedPath}: 没有匹配项`)
      expandedPaths.push(...expanded)
    } catch (error) {
      errors.push(`ls: ${requestedPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const absolutePath of expandedPaths) {
    if (signal?.aborted) throw signal.reason
    try {
      const stats = await lstat(absolutePath)
      if (stats.isDirectory()) {
        await listDirectory(absolutePath, options, 0, rows, errors, new Set())
      } else {
        rows.push(await createRow(absolutePath, path.basename(absolutePath), 0, options))
      }
    } catch (error) {
      errors.push(`ls: ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Portable approximation: sum apparent bytes. GNU `ls` uses filesystem block counts.
  const total = rows.reduce((sum, row) => sum + row.size, 0)
  return { rows, total, errors, options }
}

function align(value: string | number, width: number): string {
  return String(value).padStart(width, ' ')
}

export function renderLsText(execution: LsExecution): string {
  const { rows, total, errors, options } = execution
  if (!options.long) return [...rows.map((row) => row.name), ...errors].join('\n')

  const linksWidth = Math.max(1, ...rows.map((row) => String(row.links).length))
  const ownerWidth = Math.max(1, ...rows.map((row) => row.owner.length))
  const groupWidth = Math.max(1, ...rows.map((row) => row.group.length))
  const sizeWidth = Math.max(1, ...rows.map((row) => row.displaySize.length))
  const lines = rows.map(
    (row) =>
      `${row.mode} ${align(row.links, linksWidth)} ${row.owner.padEnd(ownerWidth)} ${row.group.padEnd(
        groupWidth
      )} ${align(row.displaySize, sizeWidth)} ${row.mtime} ${row.name}`
  )
  return [`total ${options.humanReadable ? formatSize(total) : total}`, ...lines, ...errors].join('\n')
}

export const lsCommand: CommandDefinition = {
  schema: {
    name: 'ls',
    summary: '列出目录内容',
    usage: 'ls [-lahR] [path...]',
    builtin: true,
    risk: 'low',
    flags: [
      { short: 'l', long: 'long', description: '使用长格式' },
      { short: 'a', long: 'all', description: '包含以 . 开头的项目' },
      { short: 'h', long: 'human-readable', description: '易读文件大小' },
      { short: 'R', long: 'recursive', description: '递归列出子目录' }
    ]
  },
  async execute(invocation: CommandInvocation, context: CommandContext): Promise<CommandResult> {
    const execution = await executeLs(invocation.args, context.shell.cwd, context.signal)
    const rawText = renderLsText(execution)
    return {
      exitCode: execution.errors.length === 0 ? 0 : 1,
      stdout: [
        {
          kind: 'table',
          columns: ['mode', 'links', 'owner', 'group', 'size', 'mtime', 'name'],
          rows: execution.rows,
          ...(invocation.sourceBlockId ? { sourceBlockId: invocation.sourceBlockId } : {})
        }
      ],
      stderr: execution.errors.length > 0 ? [{ kind: 'text', lines: execution.errors }] : [],
      rawText,
      metadata: { total: execution.total, semantics: 'apparent-bytes' }
    }
  }
}
