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

export function sshRemoteCommand(sessionId: string): string {
  const name = sshSessionName(sessionId)
  return `shell="\${SHELL:-/bin/sh}"
base=$(basename "$shell")
integrate_zsh() {
  dir=$(mktemp -d)
  printf '%s\\n' 'if [[ -f "$HOME/.zshenv" ]]; then source "$HOME/.zshenv"; fi' > "$dir/.zshenv"
  printf '%s\\n' 'if [[ -f "$HOME/.zprofile" ]]; then source "$HOME/.zprofile"; fi' > "$dir/.zprofile"
  printf '%s\\n' 'if [[ -f "$HOME/.zlogin" ]]; then source "$HOME/.zlogin"; fi' > "$dir/.zlogin"
  printf '%s\\n' 'export ZDOTDIR="$HOME"' 'if [[ -f "$HOME/.zshrc" ]]; then source "$HOME/.zshrc"; fi' '__unixbridge_prompt() { print -Pn "\\e]133;A\\a" }' '__unixbridge_exec() { print -Pn "\\e]133;C\\a" }' '__unixbridge_cwd() { printf "\\e]7;file://localhost%s\\a" "$PWD"; }' 'precmd_functions+=(__unixbridge_prompt __unixbridge_cwd)' 'preexec_functions+=(__unixbridge_exec)' > "$dir/.zshrc"
  export ZDOTDIR="$dir"
}
integrate_bash() {
  rc=$(mktemp)
  printf '%s\\n' 'if [[ -f "$HOME/.bashrc" ]]; then source "$HOME/.bashrc"; fi' '__unixbridge_prompt() { printf "\\e]133;A\\a"; }' '__unixbridge_cwd() { printf "\\e]7;file://localhost%s\\a" "$PWD"; }' 'PS0="\\e]133;C\\a"' 'PROMPT_COMMAND="__unixbridge_cwd; __unixbridge_prompt\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}"' > "$rc"
}
if command -v tmux >/dev/null 2>&1 && tmux has-session -t ${name} 2>/dev/null; then
  dir=$(tmux display-message -p -t ${name} '#{pane_current_path}' 2>/dev/null || true)
  case "$dir" in
    /*) printf '\\033]7;file://localhost%s\\007' "$dir" ;;
  esac
  exec tmux new-session -A -s ${name}
fi
case "$base" in
  zsh) integrate_zsh ;;
  bash) integrate_bash ;;
esac
if command -v tmux >/dev/null 2>&1; then
  if [ "$base" = bash ]; then exec tmux new-session -s ${name} bash --rcfile "$rc" -i; fi
  if [ "$base" = zsh ]; then exec tmux new-session -s ${name} env ZDOTDIR="$ZDOTDIR" "$shell" -l; fi
  exec tmux new-session -s ${name}
fi
if [ "$base" = bash ]; then exec bash --rcfile "$rc" -i; fi
exec "$shell" -l
`
}

export function sshLaunchArguments(target: SshTarget, sessionId: string): string[] {
  const parsed = parseSshTarget(
    `${target.user ? `${target.user}@` : ''}${target.host}${target.port === 22 ? '' : `:${target.port}`}`
  )
  if (!parsed || parsed.host !== target.host || parsed.port !== target.port || parsed.user !== target.user) {
    throw new Error('SSH 目标无效')
  }
  const destination = parsed.user ? `${parsed.user}@${parsed.host}` : parsed.host
  const remote = sshRemoteCommand(sessionId)
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
