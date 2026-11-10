import type { SshTarget } from '../../shared/types'

export type { SshTarget }

const TARGET =
  /^(?:(?<user>[A-Za-z0-9_][A-Za-z0-9._-]{0,31})@)?(?<host>[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)(?::(?<port>\d{1,5}))?$/

export function parseSshTarget(input: string): SshTarget | undefined {
  const match = TARGET.exec(input.trim())
  if (!match?.groups?.host) return undefined
  const port = match.groups.port ? Number(match.groups.port) : 22
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined
  const user = match.groups.user ?? ''
  return { user, host: match.groups.host, port }
}

export function sshSessionName(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
  if (safe.length < 8) throw new Error('无效的终端会话标识')
  return `ub${safe}`
}

export function sshLaunchArguments(target: SshTarget, sessionId: string): string[] {
  const parsed = parseSshTarget(
    `${target.user ? `${target.user}@` : ''}${target.host}${target.port === 22 ? '' : `:${target.port}`}`
  )
  if (!parsed || parsed.host !== target.host || parsed.port !== target.port || parsed.user !== target.user) {
    throw new Error('SSH 目标无效')
  }
  const name = sshSessionName(sessionId)
  const destination = parsed.user ? `${parsed.user}@${parsed.host}` : parsed.host
  const remote = `if command -v tmux >/dev/null 2>&1; then exec tmux new-session -A -s ${name}; else exec "\${SHELL:-/bin/sh}" -l; fi`
  return [
    '-p',
    String(parsed.port),
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=4',
    '-o',
    'ConnectTimeout=12',
    '-t',
    destination,
    remote
  ]
}
