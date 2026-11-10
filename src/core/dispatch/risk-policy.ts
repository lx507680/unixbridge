import type { AstNode, CommandNode, RedirectNode } from '../parser'

export type RiskAction = 'allow' | 'warn' | 'confirm' | 'deny'

export interface RiskContext {
  rawInput: string
  ast?: AstNode
  cwd: string
  platform: NodeJS.Platform
  isElevated?: boolean
}

export interface RiskDecision {
  action: RiskAction
  ruleId: string
  reason: string
  irreversible: boolean
  audit: boolean
}

export interface RiskRule {
  id: string
  action: Exclude<RiskAction, 'allow'>
  reason: string
  irreversible?: boolean
  matches: (context: RiskContext) => boolean
}

export interface AuditRecord {
  timestamp: string
  input: string
  cwd: string
  decision: RiskDecision
  outcome: 'allowed' | 'cancelled' | 'denied' | 'executed' | 'failed'
}

function commandNodes(ast: AstNode | undefined): CommandNode[] {
  if (!ast) return []
  if (ast.kind === 'command') return [ast]
  if (ast.kind === 'redirect') return commandNodes(ast.command)
  if (ast.kind === 'pipeline') return ast.commands.flatMap(commandNodes)
  if (ast.kind === 'sequence') return ast.commands.flatMap(commandNodes)
  return [...commandNodes(ast.left), ...commandNodes(ast.right)]
}

function redirects(ast: AstNode | undefined): RedirectNode[] {
  if (!ast) return []
  if (ast.kind === 'redirect') return [ast, ...redirects(ast.command)]
  if (ast.kind === 'pipeline' || ast.kind === 'sequence') return ast.commands.flatMap(redirects)
  if (ast.kind === 'and' || ast.kind === 'or') return [...redirects(ast.left), ...redirects(ast.right)]
  return []
}

function hasCommand(context: RiskContext, name: string): boolean {
  return commandNodes(context.ast).some((command) => command.name.toLowerCase() === name)
}

function rawRecursiveForceRemove(rawInput: string): boolean {
  if (!/(?:^|&&|\|\||;|\|)\s*rm\b/i.test(rawInput)) return false
  const flags = rawInput.match(/(?:^|\s)-{1,2}[A-Za-z-]+/g)?.map((flag) => flag.trim().toLowerCase()) ?? []
  const hasShort = (letter: string) =>
    flags.some((flag) => flag === `-${letter}` || (flag.startsWith('-') && !flag.startsWith('--') && flag.includes(letter)))
  return (
    flags.some((flag) => flag === '-rf' || flag === '-fr') ||
    (flags.includes('--recursive') && flags.includes('--force')) ||
    (hasShort('r') && hasShort('f'))
  )
}

function hasSystemPath(value: string): boolean {
  const normalized = value.replaceAll('/', '\\').toLowerCase()
  return (
    /^[a-z]:\\windows(?:\\|$)/.test(normalized) ||
    /^[a-z]:\\program files(?: \(x86\))?(?:\\|$)/.test(normalized) ||
    normalized.startsWith('\\\\?\\globalroot\\') ||
    normalized.startsWith('\\etc\\') ||
    normalized === '\\etc' ||
    normalized.startsWith('\\usr\\')
  )
}

export const defaultRiskRules: readonly RiskRule[] = [
  {
    id: 'deny-format-volume',
    action: 'deny',
    reason: '禁止通过 unixbridge 格式化磁盘或卷。',
    irreversible: true,
    matches: (context) => hasCommand(context, 'format') || /^\s*format(?:\.com)?\b/i.test(context.rawInput)
  },
  {
    id: 'deny-del-recursive-force',
    action: 'deny',
    reason: '禁止执行 Windows del /f /s /q 组合。',
    irreversible: true,
    matches: ({ rawInput }) =>
      /^\s*del\b/i.test(rawInput) &&
      ['/f', '/s', '/q'].every((flag) => rawInput.toLowerCase().includes(flag))
  },
  {
    id: 'deny-reg-delete',
    action: 'deny',
    reason: '禁止直接删除注册表项。',
    irreversible: true,
    matches: ({ rawInput }) => /^\s*reg(?:\.exe)?\s+delete\b/i.test(rawInput)
  },
  {
    id: 'deny-execution-policy',
    action: 'deny',
    reason: '禁止修改 PowerShell ExecutionPolicy。',
    matches: ({ rawInput }) => /\bSet-ExecutionPolicy\b/i.test(rawInput)
  },
  {
    id: 'deny-destructive-system-path',
    action: 'deny',
    reason: '禁止删除或移动系统目录中的内容。',
    irreversible: true,
    matches: (context) =>
      commandNodes(context.ast).some(
        (command) =>
          ['rm', 'mv'].includes(command.name) && command.args.some((arg) => hasSystemPath(arg))
      )
  },
  {
    id: 'confirm-rm-recursive-force',
    action: 'confirm',
    reason: 'rm 递归强制删除可能不可恢复。',
    irreversible: true,
    matches: (context) =>
      rawRecursiveForceRemove(context.rawInput) ||
      commandNodes(context.ast).some(
        (command) =>
          command.name.toLowerCase() === 'rm' &&
          (command.args.includes('-rf') ||
            command.args.includes('-fr') ||
            (command.args.includes('-r') && command.args.includes('-f')))
      )
  },
  {
    id: 'confirm-rmdir-recursive',
    action: 'confirm',
    reason: 'rmdir /s 会递归删除目录。',
    irreversible: true,
    matches: ({ rawInput }) => /^\s*rmdir\b.*(?:\/s\b)/i.test(rawInput)
  },
  {
    id: 'confirm-force-kill',
    action: 'confirm',
    reason: 'kill -9 不允许目标进程清理资源。',
    matches: (context) =>
      commandNodes(context.ast).some(
        (command) => command.name === 'kill' && command.args.includes('-9')
      )
  },
  {
    id: 'confirm-elevation',
    action: 'confirm',
    reason: '提权命令可能修改系统范围资源。',
    matches: (context) =>
      hasCommand(context, 'sudo') || /\b(?:RunAs|Start-Process\s+.+-Verb\s+RunAs)\b/i.test(context.rawInput)
  },
  {
    id: 'confirm-download-pipe-shell',
    action: 'confirm',
    reason: '将网络内容直接传给 shell 具有远程代码执行风险。',
    irreversible: true,
    matches: ({ rawInput }) => /\bcurl\b[^|]*\|\s*(?:sh|bash|zsh|pwsh|powershell)\b/i.test(rawInput)
  },
  {
    id: 'confirm-system-path-write',
    action: 'confirm',
    reason: '写入系统路径可能破坏操作系统或已安装程序。',
    matches: (context) =>
      redirects(context.ast).some((node) =>
        node.redirects.some((redirect) => redirect.target && hasSystemPath(redirect.target))
      ) ||
      commandNodes(context.ast).some(
        (command) =>
          ['rm', 'mv', 'cp', 'mkdir', 'touch'].includes(command.name) &&
          command.args.some(hasSystemPath)
      )
  },
  {
    id: 'confirm-path-registry-change',
    action: 'confirm',
    reason: '修改注册表 PATH 会影响后续进程和系统配置。',
    matches: ({ rawInput }) =>
      /\b(?:reg(?:\.exe)?\s+add|Set-ItemProperty)\b.*\bPATH\b/i.test(rawInput)
  },
  {
    id: 'warn-unknown-command',
    action: 'warn',
    reason: '命令不在内置白名单中；请明确选择 WSL/Git Bash fallback。',
    matches: (context) => context.ast === undefined
  }
]

const actionPriority: Record<Exclude<RiskAction, 'allow'>, number> = {
  deny: 3,
  confirm: 2,
  warn: 1
}

export class RiskPolicy {
  constructor(private readonly rules: readonly RiskRule[] = defaultRiskRules) {}

  evaluate(context: RiskContext): RiskDecision {
    const matches = this.rules
      .filter((rule) => rule.matches(context))
      .sort((a, b) => actionPriority[b.action] - actionPriority[a.action])
    const matched = matches[0]
    if (!matched) {
      return {
        action: 'allow',
        ruleId: 'default-allow',
        reason: '命令未命中风险规则。',
        irreversible: false,
        audit: true
      }
    }
    return {
      action: matched.action,
      ruleId: matched.id,
      reason: matched.reason,
      irreversible: matched.irreversible ?? false,
      audit: true
    }
  }
}
