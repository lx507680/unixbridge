import { parseCommandLine } from '../parser'
import catalog from './catalog.json'

export type TranslatorOs = 'windows' | 'macos' | 'linux'

export interface CatalogEntry {
  cmd: string
  os: TranslatorOs
  columns: string[]
  desc: string
  powershell?: string
}

export interface TranslatedCommand {
  cmd: string
  os: TranslatorOs
  original: string
  translated: string
  changed: boolean
  notice: string
  shellLine: string
  description: string
}

const entries = catalog.commands as CatalogEntry[]

function normalizeOs(os: string): TranslatorOs | undefined {
  const value = os.toLowerCase()
  if (value === 'windows' || value === 'win32') return 'windows'
  if (value === 'macos' || value === 'darwin' || value === 'mac') return 'macos'
  if (value === 'linux') return 'linux'
  return undefined
}

function powershellLiteral(value: string): string | undefined {
  if (/[\0\r\n]/.test(value)) return undefined
  return `'${value.replaceAll("'", "''")}'`
}

function quoteAll(values: readonly string[]): string[] | undefined {
  const quoted: string[] = []
  for (const value of values) {
    const literal = powershellLiteral(value)
    if (literal === undefined) return undefined
    quoted.push(literal)
  }
  return quoted
}

function withNotice(translated: string): { notice: string; shellLine: string } | undefined {
  const notice = `[系统翻译]: 正在执行等效命令: ${translated}`
  const literal = powershellLiteral(notice)
  if (literal === undefined) return undefined
  return { notice, shellLine: `Write-Output ${literal}; ${translated}` }
}

function translateLs(args: readonly string[]): string | undefined {
  let all = false
  let long = false
  const paths: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (arg === '--') {
      const quoted = quoteAll(args.slice(index + 1))
      if (quoted === undefined) return undefined
      paths.push(...quoted)
      break
    }
    if (arg.startsWith('-') && arg !== '-') {
      if (!/^-[aAlhF1]+$/.test(arg)) return undefined
      if (arg.includes('a') || arg.includes('A')) all = true
      if (arg.includes('l')) long = true
      continue
    }
    const quoted = powershellLiteral(arg)
    if (quoted === undefined) return undefined
    paths.push(quoted)
  }
  const parts = ['Get-ChildItem']
  if (all) parts.push('-Force')
  if (paths.length > 0) parts.push('-LiteralPath', paths.join(','))
  const command = parts.join(' ')
  return long ? `${command} | Format-List` : command
}

function translateGrep(args: readonly string[]): string | undefined {
  let recursive = false
  let insensitive = false
  let invert = false
  const patterns: string[] = []
  const paths: string[] = []
  let operands = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (!operands && arg === '--') {
      operands = true
      continue
    }
    if (!operands && arg === '-e') {
      const pattern = args[index + 1]
      if (pattern === undefined) return undefined
      const quoted = powershellLiteral(pattern)
      if (quoted === undefined) return undefined
      patterns.push(quoted)
      index += 1
      continue
    }
    if (!operands && arg.startsWith('-') && arg !== '-') {
      if (!/^-[inrvRH]+$/.test(arg)) return undefined
      if (arg.includes('i')) insensitive = true
      if (arg.includes('v')) invert = true
      if (arg.includes('r') || arg.includes('R')) recursive = true
      continue
    }
    const quoted = powershellLiteral(arg)
    if (quoted === undefined) return undefined
    if (patterns.length === 0) patterns.push(quoted)
    else paths.push(quoted)
  }
  const pattern = patterns[0]
  if (pattern === undefined) return undefined
  const select = ['Select-String', '-Pattern', pattern]
  if (!insensitive) select.push('-CaseSensitive')
  if (invert) select.push('-NotMatch')
  if (!recursive) {
    if (paths.length > 0) select.push('-Path', paths.join(','))
    return select.join(' ')
  }
  const listing = ['Get-ChildItem', '-Recurse', '-File']
  if (paths.length > 0) listing.push('-Path', paths.join(','))
  return `${listing.join(' ')} | ${select.join(' ')}`
}

function translateFind(args: readonly string[]): string | undefined {
  const paths: string[] = []
  let name: string | undefined
  let type: 'd' | 'f' | undefined
  let maxDepth: number | undefined
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (arg === '-name' || arg === '-iname') {
      const value = args[index + 1]
      if (value === undefined) return undefined
      name = value
      index += 1
      continue
    }
    if (arg === '-type') {
      const value = args[index + 1]
      if (value !== 'd' && value !== 'f') return undefined
      type = value
      index += 1
      continue
    }
    if (arg === '-maxdepth') {
      const value = args[index + 1] ?? ''
      if (!/^\d{1,3}$/.test(value)) return undefined
      maxDepth = Number(value)
      index += 1
      continue
    }
    if (arg === '-print' || arg === '-L' || arg === '-P' || arg === '-H') continue
    if (arg.startsWith('-')) return undefined
    paths.push(arg)
  }
  const parts = ['Get-ChildItem']
  if (paths.length > 0) {
    const quoted = quoteAll(paths)
    if (quoted === undefined) return undefined
    parts.push('-LiteralPath', quoted.join(','))
  }
  if (maxDepth === undefined || maxDepth > 1) {
    parts.push('-Recurse')
    if (maxDepth !== undefined && maxDepth > 1) parts.push('-Depth', String(maxDepth - 1))
  }
  if (type === 'd') parts.push('-Directory')
  if (type === 'f') parts.push('-File')
  if (name !== undefined) {
    const quoted = powershellLiteral(name)
    if (quoted === undefined) return undefined
    parts.push('-Filter', quoted)
  }
  return parts.join(' ')
}

export class CommandTranslator {
  getDescription(cmd: string, os: string): string {
    const platform = normalizeOs(os)
    if (!platform) return ''
    return entries.find((entry) => entry.cmd === cmd.toLowerCase() && entry.os === platform)?.desc ?? ''
  }

  translate(command: string, os: string): TranslatedCommand | undefined {
    const platform = normalizeOs(os)
    const original = command.trim()
    if (!platform || original.length === 0 || /[\0\r\n]/.test(original)) return undefined
    const parsed = parseCommandLine(original)
    if (!parsed.ok || parsed.ast.kind !== 'command') return undefined
    const cmd = parsed.ast.name.toLowerCase()
    if (cmd.includes('/') || cmd.includes('\\')) return undefined
    const entry = entries.find((item) => item.cmd === cmd && item.os === platform)
    if (!entry) return undefined
    const description = entry.desc
    if (platform !== 'windows' || entry.powershell === undefined) {
      return {
        cmd,
        os: platform,
        original,
        translated: original,
        changed: false,
        notice: '',
        shellLine: original,
        description
      }
    }
    const translated =
      cmd === 'ls'
        ? translateLs(parsed.ast.args)
        : cmd === 'grep'
          ? translateGrep(parsed.ast.args)
          : cmd === 'find'
            ? translateFind(parsed.ast.args)
            : undefined
    if (translated === undefined) return undefined
    const announced = withNotice(translated)
    if (announced === undefined) return undefined
    return {
      cmd,
      os: platform,
      original,
      translated,
      changed: translated !== original,
      notice: announced.notice,
      shellLine: announced.shellLine,
      description
    }
  }
}

export const commandTranslator = new CommandTranslator()

export function translate(command: string, os: string): TranslatedCommand | undefined {
  return commandTranslator.translate(command, os)
}

export function getDescription(cmd: string, os: string): string {
  return commandTranslator.getDescription(cmd, os)
}
