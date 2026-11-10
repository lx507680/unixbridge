export type TerminalInputMode = 'prompt' | 'running' | 'application'

export interface ScreenScan {
  output: string
  mode: TerminalInputMode
  sawPrompt: boolean
  sawCommandStart: boolean
  pending: string
}

const MARK = /\x1b\[\?(?:47|1047|1049)[hl]|\x1b\]133;[AC](?:\x07|\x1b\\)/g
const PROMPT_MARK = /\x1b\]133;[AC](?:\x07|\x1b\\)/g
const MARK_TEXT = [
  '\x1b[?47h',
  '\x1b[?47l',
  '\x1b[?1047h',
  '\x1b[?1047l',
  '\x1b[?1049h',
  '\x1b[?1049l',
  '\x1b]133;A\x07',
  '\x1b]133;C\x07',
  '\x1b]133;A\x1b\\',
  '\x1b]133;C\x1b\\'
]

function pendingMarker(data: string): string {
  const start = data.lastIndexOf('\x1b')
  if (start < 0) return ''
  const suffix = data.slice(start)
  const partial = MARK_TEXT.some((mark) => mark.startsWith(suffix) && mark.length > suffix.length)
  return partial ? suffix : ''
}

export function scanTerminalOutput(current: TerminalInputMode, data: string): ScreenScan {
  const pending = pendingMarker(data)
  const ready = pending ? data.slice(0, -pending.length) : data
  let mode = current
  let sawPrompt = false
  let sawCommandStart = false
  for (const match of ready.matchAll(MARK)) {
    const token = match[0]
    if (token.startsWith('\x1b[?') && token.endsWith('h')) {
      mode = 'application'
      continue
    }
    if (token.startsWith('\x1b[?') && token.endsWith('l')) {
      if (mode === 'application') mode = 'running'
      continue
    }
    if (token.includes('133;C')) {
      sawCommandStart = true
      if (mode !== 'application') mode = 'running'
      continue
    }
    if (token.includes('133;A')) {
      sawPrompt = true
      if (mode !== 'application') mode = 'prompt'
    }
  }
  return {
    output: ready.replace(PROMPT_MARK, ''),
    mode,
    sawPrompt,
    sawCommandStart,
    pending
  }
}

const COMMAND_MARK_SOURCE = '\\x1b\\]133;[AC](?:\\x07|\\x1b\\\\)'

export function collectCommandOutput(
  current: string,
  capturing: boolean,
  data: string
): { output: string; capturing: boolean } {
  let output = capturing ? current : ''
  let cursor = 0
  let active = capturing
  for (const match of data.matchAll(new RegExp(COMMAND_MARK_SOURCE, 'g'))) {
    const start = match.index ?? 0
    if (active) output += data.slice(cursor, start)
    cursor = start + match[0].length
    if (match[0].includes('133;C')) {
      active = true
      output = ''
    } else if (match[0].includes('133;A')) {
      active = false
    }
  }
  if (active) output += data.slice(cursor)
  return { output: output.slice(-20_000), capturing: active }
}

function isPromptLine(text: string): boolean {
  return (
    /^PS [\w:\\ ].*>\s*$/.test(text) ||
    /[\w.-]+@[\w.-]+.*[%$#❯›]\s*$/.test(text) ||
    /^[%$#❯›]\s*$/.test(text)
  )
}

export function presentCommandOutput(raw: string): string {
  const text = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replaceAll('\r', '')
  const lines = text.split('\n')
  while (lines.length > 0 && isPromptLine(lines[lines.length - 1]?.trim() ?? '')) lines.pop()
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop()
  return lines.join('\n').trim()
}
