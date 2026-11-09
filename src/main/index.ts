import { app, BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import * as pty from 'node-pty'
import { registerWorkspaceIpc } from './workspace-ipc'

interface PtySession {
  ownerId: number
  terminal: pty.IPty
}

const sessions = new Map<string, PtySession>()

function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return false

  const url = event.senderFrame?.url ?? event.sender.getURL()
  return process.env.ELECTRON_RENDERER_URL
    ? url.startsWith(process.env.ELECTRON_RENDERER_URL)
    : url.startsWith('file://')
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

function spawnShell(cols: number, rows: number): { terminal: pty.IPty; shell: string } {
  const options: pty.IPtyForkOptions = {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.USERPROFILE ?? process.env.HOME ?? process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>
  }

  if (process.platform !== 'win32') {
    const shell = process.env.SHELL ?? '/bin/zsh'
    return { terminal: pty.spawn(shell, ['-l'], options), shell: shellName(shell) }
  }

  let lastError: unknown
  for (const candidate of windowsShellCandidates()) {
    if (candidate.includes('\\') && !existsSync(candidate)) continue
    try {
      return {
        terminal: pty.spawn(candidate, ['-NoLogo'], { ...options, useConpty: true }),
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

function registerPtyIpc(): void {
  ipcMain.handle(
    'pty:start',
    (event, request: { sessionId: string; cols: number; rows: number }) => {
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
      const { terminal, shell } = spawnShell(cols, rows)
      sessions.set(sessionId, { ownerId: event.sender.id, terminal })

      terminal.onData((data) => {
        if (!event.sender.isDestroyed()) event.sender.send('pty:data', { sessionId, data })
      })
      terminal.onExit(({ exitCode }) => {
        if (sessions.get(sessionId)?.terminal === terminal) sessions.delete(sessionId)
        if (!event.sender.isDestroyed()) event.sender.send('pty:exit', { sessionId, exitCode })
      })

      return { sessionId, platform: process.platform, pid: terminal.pid, shell }
    }
  )

  ipcMain.on('pty:write', (event, request: { sessionId: string; data: string }) => {
    if (!isTrustedSender(event) || typeof request?.data !== 'string') return
    const session = sessions.get(request.sessionId)
    if (session?.ownerId === event.sender.id) session.terminal.write(request.data)
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

  const webContentsId = window.webContents.id
  window.on('closed', () => disposeOwnerSessions(webContentsId))

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerPtyIpc()
  registerWorkspaceIpc(isTrustedSender)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const sessionId of sessions.keys()) disposeSession(sessionId)
  if (process.platform !== 'darwin') app.quit()
})
