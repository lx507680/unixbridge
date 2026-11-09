import { contextBridge, ipcRenderer } from 'electron'

export interface PtyStartResult {
  platform: NodeJS.Platform
  pid: number
}

export interface UnixbridgeApi {
  start: (cols: number, rows: number) => Promise<PtyStartResult>
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  onData: (listener: (data: string) => void) => () => void
  onExit: (listener: (exitCode: number) => void) => () => void
}

const api: UnixbridgeApi = {
  start: (cols, rows) => ipcRenderer.invoke('pty:start', { cols, rows }),
  write: (data) => ipcRenderer.send('pty:write', data),
  resize: (cols, rows) => ipcRenderer.send('pty:resize', { cols, rows }),
  onData: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string): void => listener(data)
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },
  onExit: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, exitCode: number): void =>
      listener(exitCode)
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  }
}

contextBridge.exposeInMainWorld('unixbridge', api)
