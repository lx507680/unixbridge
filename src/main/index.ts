import { app, BrowserWindow, ipcMain, Notification, protocol, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { appendFile, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import * as pty from 'node-pty'
import { assessSubmittedLine } from '../core/dispatch'
import {
  cancelConfirmedLine,
  createPtyGateState,
  gatePtyChunk,
  releaseConfirmedLine,
  type PtyGateState
} from '../core/dispatch/pty-gate'
import type { AuditRecord } from '../core/dispatch/risk-policy'
import { writeAtomic } from '../core/fs/atomic'
import { localeEnv } from '../core/locale'
import { normalizeUserPath, resolveHomePath } from '../core/path'
import { parseCommandLine } from '../core/parser'
import { previewMime } from '../core/preview/kind'
import { ensureShellIntegration, powershellStartup } from '../core/shell/integration'
import { scanTerminalOutput, presentCommandOutput, collectCommandOutput, type TerminalInputMode } from '../core/terminal/screen-mode'
import { ShellState } from '../core/shellstate'
import { sshLaunchArguments, type SshTarget } from '../core/ssh/target'
import { sanitizeStoredWorkspace, type StoredWorkspace } from '../core/workspace/stored'
import type { PtyWriteResult } from '../shared/types'
import { registerWorkspaceIpc } from './workspace-ipc'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'unixbridge',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: false }
  }
])

interface PtySession {
  id: string
  ownerId: number
  terminal: pty.IPty
  gate: PtyGateState
  shell: ShellState
  inputMode: TerminalInputMode
  integrationSeen: boolean
  awaitingPrompt: boolean
  promptClosesCommand: boolean
  lastCommand: string
  commandStartedAt: number
  commandOutput: string
  outputCarry: string
  promptTimer?: NodeJS.Timeout
}

const sessions = new Map<string, PtySession>()
const previewToken = randomBytes(24).toString('hex')
let mainWindow: BrowserWindow | null = null

function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return false

  const url = event.senderFrame?.url ?? event.sender.getURL()
  if (process.env.ELECTRON_RENDERER_URL) return url.startsWith(process.env.ELECTRON_RENDERER_URL)
  try {
    const expected = resolve(join(__dirname, '../renderer/index.html'))
    return resolve(fileURLToPath(url)) === expected
  } catch {
    return false
  }
}

function windowsShellCandidates(): string[] {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  return [
    join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    'pwsh.exe',
    'powershell.exe'
  ]
}

function shellName(shellPath: string): string {
  const name = basename(shellPath).replace(/\.exe$/i, '')
  if (/^(pwsh|powershell)$/i.test(name)) return 'PowerShell'
  return name || 'shell'
}

function sessionsFile(): string {
  return join(app.getPath('userData'), 'sessions.json')
}

async function loadStoredSessions(): Promise<StoredWorkspace> {
  try {
    return sanitizeStoredWorkspace(JSON.parse(await readFile(sessionsFile(), 'utf8')))
  } catch {
    return { sessions: [], groups: [] }
  }
}

async function saveStoredSessions(input: unknown): Promise<StoredWorkspace> {
  const workspace = sanitizeStoredWorkspace(input)
  await writeAtomic(sessionsFile(), JSON.stringify(workspace))
  return workspace
}

function spawnShell(
  cols: number,
  rows: number,
  ssh?: SshTarget,
  sessionId = '',
  loadProfile = true
): { terminal: pty.IPty; shell: string } {
  const options: pty.IPtyForkOptions = {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.USERPROFILE ?? process.env.HOME ?? process.cwd(),
    env: { ...localeEnv(), TERM: 'xterm-256color' } as Record<string, string>
  }

  if (ssh) {
    const command = process.platform === 'win32' ? 'ssh.exe' : 'ssh'
    return {
      terminal: pty.spawn(command, sshLaunchArguments(ssh, sessionId), options),
      shell: 'ssh'
    }
  }

  if (process.platform !== 'win32') {
    const shellPath = process.env.SHELL ?? '/bin/zsh'
    const integration = ensureShellIntegration(app.getPath('userData'))
    const shellBase = basename(shellPath).toLowerCase()
    if (shellBase === 'bash') {
      return {
        terminal: pty.spawn(shellPath, ['--rcfile', integration.bash, '-i'], options),
        shell: shellName(shellPath)
      }
    }
    if (shellBase === 'zsh' || shellBase === '') {
      return {
        terminal: pty.spawn(shellPath, ['-l'], {
          ...options,
          env: { ...options.env, ZDOTDIR: integration.zsh }
        }),
        shell: shellName(shellPath)
      }
    }
    return { terminal: pty.spawn(shellPath, ['-l'], options), shell: shellName(shellPath) }
  }

  let lastError: unknown
  const args = ['-NoLogo', '-NoExit', '-Command', powershellStartup(loadProfile)]
  for (const candidate of windowsShellCandidates()) {
    if (candidate.includes('\\') && !existsSync(candidate)) continue
    try {
      return {
        terminal: pty.spawn(candidate, args, { ...options, useConpty: true }),
        shell: 'PowerShell'
      }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`无法启动 PowerShell: ${String(lastError)}`)
}

function disposeSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (!session) return
  if (session.promptTimer) clearTimeout(session.promptTimer)
  sessions.delete(sessionId)
  try {
    session.terminal.kill()
  } catch {
    // PTY may already have exited.
  }
}

function disposeOwnerSessions(ownerId: number): void {
  for (const [sessionId, session] of sessions) {
    if (session.ownerId === ownerId) disposeSession(sessionId)
  }
}

function noteSubmittedCommand(shell: ShellState, line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return
  shell.addHistory(trimmed, 0)
  const parsed = parseCommandLine(trimmed)
  if (!parsed.ok || parsed.ast.kind !== 'command' || parsed.ast.name !== 'cd') return
  const target = parsed.ast.args.find((arg) => !arg.startsWith('-'))
  if (!target) return
  try {
    shell.cwd = normalizeUserPath(target, { cwd: shell.cwd, platform: process.platform })
  } catch {
    // Keep the previous directory when the path cannot be normalized.
  }
}

function auditFile(): string {
  return join(app.getPath('userData'), 'audit.jsonl')
}

function rememberAudit(record: AuditRecord): void {
  const file = auditFile()
  void appendFile(file, `${JSON.stringify(record)}\n`)
    .then(async () => {
      const details = await stat(file).catch(() => null)
      if (!details || details.size < 256 * 1024) return
      const lines = (await readFile(file, 'utf8')).trim().split(/\r?\n/).slice(-200)
      await writeAtomic(file, `${lines.join('\n')}\n`)
    })
    .catch(() => undefined)
}

async function recentAudit(): Promise<AuditRecord[]> {
  try {
    const lines = (await readFile(auditFile(), 'utf8')).trim().split(/\r?\n/).slice(-40)
    return lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as AuditRecord]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

function publishMode(session: PtySession, sender: Electron.WebContents, output = ''): void {
  if (!sender.isDestroyed()) {
    sender.send('pty:mode', {
      sessionId: session.id,
      mode: session.inputMode,
      ...(output ? { output } : {})
    })
  }
}

function finishCommand(session: PtySession, sender: Electron.WebContents): void {
  const elapsed = Date.now() - session.commandStartedAt
  const command = session.lastCommand
  const output = presentCommandOutput(session.commandOutput)
  session.commandOutput = ''
  session.awaitingPrompt = false
  session.gate.buffer.reset()
  session.gate.pending = null
  if (session.promptTimer) clearTimeout(session.promptTimer)
  if (command && elapsed >= 1500 && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
    new Notification({
      title: '命令已结束',
      body: command.slice(0, 120)
    }).show()
  }
  publishMode(session, sender, output)
}

function schedulePromptFallback(session: PtySession, sender: Electron.WebContents): void {
  if (session.inputMode !== 'running' || session.promptClosesCommand) return
  if (session.promptTimer) clearTimeout(session.promptTimer)
  session.promptTimer = setTimeout(() => {
    if (session.inputMode !== 'running' || session.promptClosesCommand) return
    session.inputMode = 'prompt'
    finishCommand(session, sender)
  }, 800)
}

function markCommandRunning(session: PtySession, sender: Electron.WebContents, line: string): void {
  session.inputMode = 'running'
  session.awaitingPrompt = Boolean(line)
  session.promptClosesCommand = false
  session.commandOutput = ''
  session.lastCommand = line
  session.commandStartedAt = Date.now()
  session.gate.buffer.reset()
  session.gate.pending = null
  publishMode(session, sender)
  schedulePromptFallback(session, sender)
}

function publicWriteResult(sessionId: string, result: ReturnType<typeof gatePtyChunk>): PtyWriteResult & { sessionId: string } {
  const decision = result.decision
  return {
    sessionId,
    action: decision?.action ?? 'none',
    ruleId: decision?.ruleId ?? '',
    reason: decision?.reason ?? '',
    line: result.line.slice(0, 2000),
    ...(result.token ? { token: result.token } : {})
  }
}

function applyPtyInput(
  session: PtySession,
  data: string,
  sender: Electron.WebContents
): ReturnType<typeof gatePtyChunk> {
  if (session.inputMode === 'application') {
    session.terminal.write(data)
    return { forward: data, decision: null, line: '' }
  }
  const modeBefore = session.inputMode
  const result = gatePtyChunk(session.gate, data, {
    cwd: session.shell.cwd,
    platform: process.platform,
    createToken: () => randomBytes(16).toString('hex')
  })
  let forward = result.forward
  if (modeBefore === 'running' && result.decision?.action === 'deny') {
    forward = `${forward.replaceAll('\u0003', '')}\u0015`
  }
  if (forward) session.terminal.write(forward)
  const decision = result.decision
  if (decision?.audit && decision.action !== 'confirm') {
    rememberAudit({
      timestamp: new Date().toISOString(),
      input: result.line.slice(0, 2000),
      cwd: session.shell.cwd,
      decision,
      outcome: decision.action === 'deny' ? 'denied' : 'executed'
    })
  }
  if (decision && (decision.action === 'allow' || decision.action === 'warn') && result.line && /[\r\n]/.test(data)) {
    noteSubmittedCommand(session.shell, result.line)
    markCommandRunning(session, sender, result.line)
  } else if (decision && (decision.action === 'allow' || decision.action === 'warn') && result.line) {
    noteSubmittedCommand(session.shell, result.line)
  }
  return result
}

function registerPtyIpc(): void {
  ipcMain.handle(
    'pty:start',
    (event, request: { sessionId: string; cols: number; rows: number; ssh?: SshTarget; loadProfile?: boolean }) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的 PTY 请求')
      const sessionId = String(request.sessionId ?? '')
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(sessionId)) throw new Error('无效的终端会话标识')
      if (
        [...sessions.values()].filter((session) => session.ownerId === event.sender.id).length >= 20
      ) {
        throw new Error('最多同时打开 20 个终端会话')
      }
      disposeSession(sessionId)

      const cols = Math.max(2, Math.floor(request.cols))
      const rows = Math.max(1, Math.floor(request.rows))
      if (request.ssh) sshLaunchArguments(request.ssh, sessionId)
      const { terminal, shell } = spawnShell(cols, rows, request.ssh, sessionId, request.loadProfile !== false)
      const session: PtySession = {
        id: sessionId,
        ownerId: event.sender.id,
        terminal,
        gate: createPtyGateState(),
        shell: new ShellState(homedir()),
        inputMode: 'prompt',
        integrationSeen: false,
        awaitingPrompt: false,
        promptClosesCommand: false,
        lastCommand: '',
        commandStartedAt: 0,
        commandOutput: '',
        outputCarry: ''
      }
      sessions.set(sessionId, session)

      terminal.onData((data) => {
        const combined = session.outputCarry + data
        const scan = scanTerminalOutput(session.inputMode, combined)
        session.outputCarry = scan.pending
        const ready = scan.pending ? combined.slice(0, -scan.pending.length) : combined
        const wasCapturing = session.promptClosesCommand
        const collected = collectCommandOutput(session.commandOutput, wasCapturing, ready)
        if (wasCapturing || collected.capturing || collected.output) session.commandOutput = collected.output
        const previous = session.inputMode
        if (scan.sawPrompt || scan.sawCommandStart) session.integrationSeen = true
        if (scan.sawCommandStart) {
          session.promptClosesCommand = true
          if (session.promptTimer) clearTimeout(session.promptTimer)
        }
        const closeThisCommand = scan.sawPrompt && session.awaitingPrompt && session.promptClosesCommand
        if (closeThisCommand) {
          session.inputMode = 'prompt'
          session.promptClosesCommand = false
          finishCommand(session, event.sender)
        } else {
          session.inputMode = scan.mode === 'prompt' && session.awaitingPrompt ? 'running' : scan.mode
          if (previous !== session.inputMode) publishMode(session, event.sender)
          if (session.inputMode === 'running') schedulePromptFallback(session, event.sender)
        }
        if (scan.output && !event.sender.isDestroyed()) {
          event.sender.send('pty:data', { sessionId, data: scan.output })
        }
      })
      terminal.onExit(({ exitCode }) => {
        if (sessions.get(sessionId)?.terminal !== terminal) return
        sessions.delete(sessionId)
        if (!event.sender.isDestroyed()) event.sender.send('pty:exit', { sessionId, exitCode })
      })

      return { sessionId, platform: process.platform, pid: terminal.pid, shell }
    }
  )

  ipcMain.on('pty:write', (event, request: { sessionId: string; data: string }) => {
    if (!isTrustedSender(event) || typeof request?.data !== 'string') return
    const session = sessions.get(request.sessionId)
    if (session?.ownerId !== event.sender.id) return
    const interactive = session.inputMode === 'running'
    const result = applyPtyInput(session, request.data, event.sender)
    const decision = result.decision
    if (
      !decision ||
      decision.action === 'allow' ||
      (interactive && decision.action === 'warn') ||
      decision.ruleId === 'opaque-line' ||
      decision.ruleId === 'empty-line'
    ) {
      return
    }
    if (!event.sender.isDestroyed()) event.sender.send('pty:risk', publicWriteResult(request.sessionId, result))
  })

  ipcMain.handle('pty:submit', (event, request: { sessionId: string; data: string }) => {
    if (!isTrustedSender(event) || typeof request?.data !== 'string') {
      throw new Error('拒绝不受信任的 PTY 请求')
    }
    const session = sessions.get(String(request.sessionId ?? ''))
    if (session?.ownerId !== event.sender.id) throw new Error('终端会话不存在')
    const interactive = session.inputMode === 'running'
    const result = applyPtyInput(session, request.data, event.sender)
    const payload = publicWriteResult(request.sessionId, result)
    const decision = result.decision
    if (
      decision &&
      decision.action !== 'allow' &&
      !(interactive && decision.action === 'warn') &&
      decision.ruleId !== 'opaque-line' &&
      decision.ruleId !== 'empty-line' &&
      !event.sender.isDestroyed()
    ) {
      event.sender.send('pty:risk', payload)
    }
    return payload
  })

  ipcMain.handle('pty:approve', (event, request: { sessionId: string; token: string }) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的 PTY 请求')
    const session = sessions.get(String(request?.sessionId ?? ''))
    if (session?.ownerId !== event.sender.id) return { approved: false }
    const released = releaseConfirmedLine(session.gate, String(request?.token ?? ''))
    if (!released) return { approved: false }
    const decision = assessSubmittedLine(released.line, session.shell.cwd, process.platform)
    session.terminal.write(released.data)
    noteSubmittedCommand(session.shell, released.line)
    markCommandRunning(session, event.sender, released.line)
    rememberAudit({
      timestamp: new Date().toISOString(),
      input: released.line.slice(0, 2000),
      cwd: session.shell.cwd,
      decision,
      outcome: 'executed'
    })
    return { approved: true }
  })

  ipcMain.handle('pty:cancel', (event, request: { sessionId: string; token: string }) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的 PTY 请求')
    const session = sessions.get(String(request?.sessionId ?? ''))
    if (session?.ownerId !== event.sender.id) return { cancelled: false }
    const cancelled = cancelConfirmedLine(session.gate, String(request?.token ?? ''))
    if (!cancelled) return { cancelled: false }
    session.terminal.write(session.inputMode === 'running' ? '\u0015' : cancelled.data)
    const decision = assessSubmittedLine(cancelled.line, session.shell.cwd, process.platform)
    rememberAudit({
      timestamp: new Date().toISOString(),
      input: cancelled.line.slice(0, 2000),
      cwd: session.shell.cwd,
      decision,
      outcome: 'cancelled'
    })
    return { cancelled: true }
  })

  ipcMain.on('pty:resize', (event, request: { sessionId: string; cols: number; rows: number }) => {
    if (!isTrustedSender(event)) return
    if (!Number.isFinite(request?.cols) || !Number.isFinite(request?.rows)) return
    const session = sessions.get(request.sessionId)
    if (session?.ownerId !== event.sender.id) return
    session.terminal.resize(
      Math.max(2, Math.floor(request.cols)),
      Math.max(1, Math.floor(request.rows))
    )
  })

  ipcMain.on('pty:dispose', (event, request: { sessionId: string }) => {
    if (!isTrustedSender(event)) return
    const session = sessions.get(request?.sessionId)
    if (session?.ownerId === event.sender.id) disposeSession(request.sessionId)
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#f5f5f5',
    title: 'unixbridge',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow = window
  const webContentsId = window.webContents.id
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
    disposeOwnerSessions(webContentsId)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerPreviewProtocol(): void {
  protocol.handle('unixbridge', async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'preview' || url.searchParams.get('token') !== previewToken) {
      return new Response('not found', { status: 404 })
    }
    try {
      const filePath = await resolveHomePath(url.searchParams.get('path') ?? '')
      const details = await stat(filePath)
      if (!details.isFile() || details.size > 20 * 1024 * 1024) {
        return new Response('unsupported', { status: 415 })
      }
      const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
      return new Response(stream, {
        headers: {
          'content-type': previewMime(filePath),
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox"
        }
      })
    } catch {
      return new Response('forbidden', { status: 403 })
    }
  })
}

function registerSessionIpc(): void {
  ipcMain.handle('sessions:load', async (event) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的会话请求')
    return loadStoredSessions()
  })
  ipcMain.handle('sessions:save', async (event, input: unknown) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的会话请求')
    return saveStoredSessions(input)
  })
  ipcMain.handle('audit:recent', async (event) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的审计请求')
    return recentAudit()
  })
}

app.whenReady().then(() => {
  registerPreviewProtocol()
  registerPtyIpc()
  registerSessionIpc()
  registerWorkspaceIpc(isTrustedSender, previewToken)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const sessionId of sessions.keys()) disposeSession(sessionId)
  if (process.platform !== 'darwin') app.quit()
})
