import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ZSH_ENV = `if [[ -f "$HOME/.zshenv" ]]; then
  source "$HOME/.zshenv"
fi
`
const ZSH_PROFILE = `if [[ -f "$HOME/.zprofile" ]]; then
  source "$HOME/.zprofile"
fi
`
const ZSH_LOGIN = `if [[ -f "$HOME/.zlogin" ]]; then
  source "$HOME/.zlogin"
fi
`
const ZSH_RC = `export ZDOTDIR="$HOME"
if [[ -f "$HOME/.zshrc" ]]; then
  source "$HOME/.zshrc"
fi
__unixbridge_prompt() { print -Pn '\\e]133;A\\a' }
__unixbridge_exec() { print -Pn '\\e]133;C\\a' }
autoload -Uz add-zsh-hook 2>/dev/null
if whence -w add-zsh-hook >/dev/null 2>&1; then
  add-zsh-hook precmd __unixbridge_prompt
  add-zsh-hook preexec __unixbridge_exec
else
  precmd_functions+=(__unixbridge_prompt)
  preexec_functions+=(__unixbridge_exec)
fi
`

const BASH_RC = `if [[ -f /etc/profile ]]; then
  source /etc/profile
fi
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bashrc" ]]; then
  source "$HOME/.bashrc"
fi
__unixbridge_prompt() { printf '\\e]133;A\\a'; }
PS0='\\e]133;C\\a'
PROMPT_COMMAND="__unixbridge_prompt\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}"
`

export function ensureShellIntegration(directory: string): { zsh: string; bash: string } {
  const root = join(directory, 'shell-integration')
  const zsh = join(root, 'zsh')
  mkdirSync(zsh, { recursive: true })
  writeFileSync(join(zsh, '.zshenv'), ZSH_ENV)
  writeFileSync(join(zsh, '.zprofile'), ZSH_PROFILE)
  writeFileSync(join(zsh, '.zshrc'), ZSH_RC)
  writeFileSync(join(zsh, '.zlogin'), ZSH_LOGIN)
  writeFileSync(join(root, 'bashrc'), BASH_RC)
  return { zsh, bash: join(root, 'bashrc') }
}

export function powershellStartup(loadProfile: boolean): string {
  const profile = loadProfile
    ? 'if (Test-Path -LiteralPath $PROFILE) { . $PROFILE }; $__ubPrompt = $function:prompt;'
    : '$__ubPrompt = $null;'
  return [
    profile,
    'if (Get-Module -ListAvailable PSReadLine) {',
    'Import-Module PSReadLine -ErrorAction SilentlyContinue;',
    "Set-PSReadLineKeyHandler -Chord 'Ctrl+a' -Function BeginningOfLine -ErrorAction SilentlyContinue;",
    "Set-PSReadLineKeyHandler -Chord 'Ctrl+e' -Function EndOfLine -ErrorAction SilentlyContinue;",
    "Set-PSReadLineKeyHandler -Chord 'Ctrl+k' -Function KillLine -ErrorAction SilentlyContinue;",
    "Set-PSReadLineKeyHandler -Chord 'Enter' -ScriptBlock {",
    '[Console]::Out.Write("$([char]27)]133;C$([char]7)");',
    '[Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()',
    '} -ErrorAction SilentlyContinue',
    '};',
    'function prompt {',
    '  [Console]::Out.Write("$([char]27)]133;A$([char]7)")',
    '  if ($__ubPrompt) { & $__ubPrompt } else { "PS $($executionContext.SessionState.Path.CurrentLocation)> " }',
    '}'
  ].join(' ')
}
