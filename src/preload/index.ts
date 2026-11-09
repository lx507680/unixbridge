import { contextBridge, ipcRenderer } from 'electron'

export interface PtyStartResult {
  sessionId: string
  platform: NodeJS.Platform
  pid: number
  shell: string
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

export interface ColumnDef {
  key: string
  header: string
  description: string
  detailed?: string
  type?: 'default' | 'numeric' | 'percentage' | 'date'
}

export interface StructuredCommandResult {
  command: 'ls' | 'ps' | 'df'
  columns: ColumnDef[]
  rows: Array<Record<string, string | number>>
  rawOutput: string
}

export interface UnixbridgeApi {
  start: (sessionId: string, cols: number, rows: number) => Promise<PtyStartResult>
  write: (sessionId: string, data: string) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  dispose: (sessionId: string) => void
  onData: (listener: (sessionId: string, data: string) => void) => () => void
  onExit: (listener: (sessionId: string, exitCode: number) => void) => () => void
  configureAi: (config: AiConfig) => Promise<{ configured: boolean }>
  chat: (messages: ChatMessage[]) => Promise<{ content: string }>
  chatStream: (messages: ChatMessage[], onChunk: (chunk: string) => void) => Promise<void>
  metrics: () => Promise<SystemMetrics>
  listFiles: (path?: string) => Promise<FileListing>
  structuredCommand: (
    command: string,
    args: string[],
    cwd?: string
  ) => Promise<StructuredCommandResult>
  workspaceContext: () => Promise<WorkspaceContext>
}

const api: UnixbridgeApi = {
  start: (sessionId, cols, rows) => ipcRenderer.invoke('pty:start', { sessionId, cols, rows }),
  write: (sessionId, data) => ipcRenderer.send('pty:write', { sessionId, data }),
  resize: (sessionId, cols, rows) =>
    ipcRenderer.send('pty:resize', { sessionId, cols, rows }),
  dispose: (sessionId) => ipcRenderer.send('pty:dispose', { sessionId }),
  onData: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; data: string }
    ): void => listener(payload.sessionId, payload.data)
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },
  onExit: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; exitCode: number }
    ): void => listener(payload.sessionId, payload.exitCode)
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  },
  configureAi: (config) => ipcRenderer.invoke('ai:configure', config),
  chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  chatStream: (messages, onChunk) =>
    new Promise<void>((resolve, reject) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const handler = (
        _event: Electron.IpcRendererEvent,
        message: { requestId: string; type: 'chunk' | 'done' | 'error'; content: string }
      ): void => {
        if (message.requestId !== requestId) return
        if (message.type === 'chunk') {
          onChunk(message.content)
          return
        }
        ipcRenderer.removeListener('ai:stream', handler)
        if (message.type === 'error') reject(new Error(message.content))
        else resolve()
      }
      ipcRenderer.on('ai:stream', handler)
      ipcRenderer.send('ai:chat-stream', { requestId, messages })
    }),
  metrics: () => ipcRenderer.invoke('system:metrics'),
  listFiles: (path) => ipcRenderer.invoke('files:list', path),
  structuredCommand: (command, args, cwd) =>
    ipcRenderer.invoke('commands:structured', { command, args, cwd }),
  workspaceContext: () => ipcRenderer.invoke('workspace:context')
}

contextBridge.exposeInMainWorld('unixbridge', api)
