import { app, BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as pty from 'node-pty'

const sessions = new Map<number, pty.IPty>()

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

function spawnShell(cols: number, rows: number): pty.IPty {
  const options: pty.IPtyForkOptions = {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.USERPROFILE ?? process.env.HOME ?? process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>
  }

  if (process.platform !== 'win32') {
    // Development-only compatibility path. Production M0 is Windows ConPTY.
    return pty.spawn(process.env.SHELL ?? '/bin/zsh', ['-l'], options)
  }

  let lastError: unknown
  for (const candidate of windowsShellCandidates()) {
    if (candidate.includes('\\') && !existsSync(candidate)) continue
    try {
      return pty.spawn(candidate, ['-NoLogo'], { ...options, useConpty: true })
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`无法启动 PowerShell: ${String(lastError)}`)
}

function disposeSession(webContentsId: number): void {
  const session = sessions.get(webContentsId)
  if (!session) return
  sessions.delete(webContentsId)
  try {
    session.kill()
  } catch {
    // PTY may already have exited.
  }
}

function registerPtyIpc(): void {
  ipcMain.handle('pty:start', (event, size: { cols: number; rows: number }) => {
    if (!isTrustedSender(event)) throw new Error('拒绝不受信任的 PTY 请求')
    disposeSession(event.sender.id)

    const cols = Math.max(2, Math.floor(size.cols))
    const rows = Math.max(1, Math.floor(size.rows))
    const session = spawnShell(cols, rows)
    sessions.set(event.sender.id, session)

    session.onData((data) => {
      if (!event.sender.isDestroyed()) event.sender.send('pty:data', data)
    })
    session.onExit(({ exitCode }) => {
      sessions.delete(event.sender.id)
      if (!event.sender.isDestroyed()) event.sender.send('pty:exit', exitCode)
    })

    return { platform: process.platform, pid: session.pid }
  })

  ipcMain.on('pty:write', (event, data: string) => {
    if (!isTrustedSender(event) || typeof data !== 'string') return
    sessions.get(event.sender.id)?.write(data)
  })

  ipcMain.on('pty:resize', (event, size: { cols: number; rows: number }) => {
    if (!isTrustedSender(event)) return
    if (!Number.isFinite(size.cols) || !Number.isFinite(size.rows)) return
    sessions.get(event.sender.id)?.resize(
      Math.max(2, Math.floor(size.cols)),
      Math.max(1, Math.floor(size.rows))
    )
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#0b0f14',
    title: 'unixbridge',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.on('closed', () => disposeSession(window.webContents.id))

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerPtyIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const id of sessions.keys()) disposeSession(id)
  if (process.platform !== 'darwin') app.quit()
})
