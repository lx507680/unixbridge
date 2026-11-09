import { contextBridge, ipcRenderer } from 'electron'

export interface PtyStartResult {
  platform: NodeJS.Platform
  pid: number
}

export interface AiConfig {
  provider: 'local' | 'api'
  endpoint: string
  model: string
  apiKey?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SystemMetrics {
  processor: {
    kind: 'gpu' | 'cpu'
    name: string
    usage: number
  }
  memory: {
    used: number
    total: number
  }
  timestamp: number
}

export interface FileItem {
  name: string
  path: string
  type: 'directory' | 'file' | 'other'
  size: number
  modifiedAt: number
}

export interface FileListing {
  path: string
  parent: string | null
  items: FileItem[]
}

export interface WorkspaceContext {
  runtime: string
  directory: string
  branch: string | null
  changes: number
}

export interface UnixbridgeApi {
  start: (cols: number, rows: number) => Promise<PtyStartResult>
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  onData: (listener: (data: string) => void) => () => void
  onExit: (listener: (exitCode: number) => void) => () => void
  configureAi: (config: AiConfig) => Promise<{ configured: boolean }>
  chat: (messages: ChatMessage[]) => Promise<{ content: string }>
  metrics: () => Promise<SystemMetrics>
  listFiles: (path?: string) => Promise<FileListing>
  workspaceContext: () => Promise<WorkspaceContext>
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
  },
  configureAi: (config) => ipcRenderer.invoke('ai:configure', config),
  chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  metrics: () => ipcRenderer.invoke('system:metrics'),
  listFiles: (path) => ipcRenderer.invoke('files:list', path),
  workspaceContext: () => ipcRenderer.invoke('workspace:context')
}

contextBridge.exposeInMainWorld('unixbridge', api)
