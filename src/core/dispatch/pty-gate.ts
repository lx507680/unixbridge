import { homedir } from 'node:os'
import { assessSubmittedLine, type DispatchDecision } from './index'

export const MAX_PTY_CHUNK = 256 * 1024

export class LineBuffer {
  text = ''
  private cursor = 0
  private unknown = false
  private escape = ''

  get opaque(): boolean {
    return this.unknown
  }

  get escaping(): boolean {
    return this.escape.length > 0
  }

  reset(): void {
    this.text = ''
    this.cursor = 0
    this.unknown = false
    this.escape = ''
  }

  private insert(char: string): void {
    if (this.unknown) return
    if (this.text.length >= 16_000) {
      this.unknown = true
      this.text = ''
      this.cursor = 0
      return
    }
    this.text = `${this.text.slice(0, this.cursor)}${char}${this.text.slice(this.cursor)}`
    this.cursor += 1
  }

  private backspace(): void {
    if (this.unknown || this.cursor === 0) return
    this.text = `${this.text.slice(0, this.cursor - 1)}${this.text.slice(this.cursor)}`
    this.cursor -= 1
  }

  private applyEscape(sequence: string): void {
    if (sequence === '\u001b[200~' || sequence === '\u001b[201~') return
    if (sequence === '\u001b[D' || sequence === '\u001bOD') {
      this.cursor = Math.max(0, this.cursor - 1)
      return
    }
    if (sequence === '\u001b[C' || sequence === '\u001bOC') {
      this.cursor = Math.min(this.text.length, this.cursor + 1)
      return
    }
    if (sequence === '\u001b[H' || sequence === '\u001bOH' || sequence === '\u001b[1~') {
      this.cursor = 0
      return
    }
    if (sequence === '\u001b[F' || sequence === '\u001bOF' || sequence === '\u001b[4~') {
      this.cursor = this.text.length
      return
    }
    if (sequence === '\u001b[3~') {
      if (!this.unknown && this.cursor < this.text.length) {
        this.text = `${this.text.slice(0, this.cursor)}${this.text.slice(this.cursor + 1)}`
      }
      return
    }
    this.unknown = true
    this.text = ''
    this.cursor = 0
  }

  feedChar(char: string): 'data' | 'newline' {
    if (this.escape) {
      this.escape += char
      if (this.escape.length > 16 || /[A-Za-z~]$/.test(char)) {
        this.applyEscape(this.escape)
        this.escape = ''
      }
      return 'data'
    }
    if (char === '\u001b') {
      this.escape = char
      return 'data'
    }
    if (char === '\r' || char === '\n') return 'newline'
    if (char === '\u007f' || char === '\b') {
      this.backspace()
      return 'data'
    }
    if (char === '\u0003' || char === '\u0015') {
      this.reset()
      return 'data'
    }
    if (char === '\u0001') {
      this.cursor = 0
      return 'data'
    }
    if (char === '\u0005') {
      this.cursor = this.text.length
      return 'data'
    }
    if (char === '\u000b') {
      if (!this.unknown) this.text = this.text.slice(0, this.cursor)
      return 'data'
    }
    if (char >= ' ') this.insert(char)
    return 'data'
  }
}

export interface PendingConfirm {
  token: string
  line: string
}

export interface PtyGateState {
  buffer: LineBuffer
  pending: PendingConfirm | null
}

export function createPtyGateState(): PtyGateState {
  return { buffer: new LineBuffer(), pending: null }
}

export interface PtyGateResult {
  forward: string
  decision: DispatchDecision | null
  line: string
  token?: string
}

export function gatePtyChunk(
  state: PtyGateState,
  data: string,
  options: { cwd?: string; platform?: NodeJS.Platform; createToken?: () => string } = {}
): PtyGateResult {
  const cwd = options.cwd ?? homedir()
  const platform = options.platform ?? process.platform
  const createToken = options.createToken ?? (() => 'confirm')
  if (data.length > MAX_PTY_CHUNK) {
    return {
      forward: '',
      decision: {
        action: 'deny',
        ruleId: 'deny-oversized-write',
        reason: '单次终端输入超过 256KB，已拒绝。',
        irreversible: false,
        audit: true,
        knownCommand: false
      },
      line: ''
    }
  }

  let forward = ''
  let decision: DispatchDecision | null = null
  let line = ''
  let token: string | undefined
  const chars = [...data]
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? ''
    if (state.pending && char !== '\r' && char !== '\n' && char !== '\u001b' && !state.buffer.escaping) {
      state.pending = null
    }
    const kind = state.buffer.feedChar(char)
    if (kind === 'data') {
      forward += char
      continue
    }

    const paired = char === '\r' && chars[index + 1] === '\n'
    const submitted = state.buffer.text
    const opaque = state.buffer.opaque
    if (opaque) {
      forward += char
      if (paired) {
        forward += '\n'
        index += 1
      }
      state.buffer.reset()
      state.pending = null
      decision = {
        action: 'allow',
        ruleId: 'opaque-line',
        reason: '这一行已被终端改写，提交前无法复核具体内容。',
        irreversible: false,
        audit: false,
        knownCommand: false
      }
      line = ''
      token = undefined
      continue
    }

    const assessed = assessSubmittedLine(submitted, cwd, platform)
    if (assessed.action === 'allow' || assessed.action === 'warn') {
      forward += char
      if (paired) {
        forward += '\n'
        index += 1
      }
      state.buffer.reset()
      state.pending = null
      decision = assessed
      line = submitted.trim()
      token = undefined
      continue
    }

    if (assessed.action === 'deny') {
      forward += '\u0003'
      if (paired) index += 1
      state.buffer.reset()
      state.pending = null
      decision = assessed
      line = submitted.trim()
      token = undefined
      continue
    }

    const trimmed = submitted.trim()
    const nextToken = state.pending?.line === trimmed ? state.pending.token : createToken()
    state.pending = { token: nextToken, line: trimmed }
    if (paired) index += 1
    decision = assessed
    line = trimmed
    token = nextToken
  }

  return token === undefined ? { forward, decision, line } : { forward, decision, line, token }
}

export function releaseConfirmedLine(
  state: PtyGateState,
  token: string
): { data: string; line: string } | undefined {
  if (!state.pending || state.pending.token !== token) return undefined
  if (state.buffer.text.trim() !== state.pending.line) return undefined
  const line = state.pending.line
  state.pending = null
  state.buffer.reset()
  return { data: '\r', line }
}

export function cancelConfirmedLine(
  state: PtyGateState,
  token: string
): { data: string; line: string } | undefined {
  if (!state.pending || state.pending.token !== token) return undefined
  const line = state.pending.line
  state.pending = null
  state.buffer.reset()
  return { data: '\u0003', line }
}
