import { contextBridge, ipcRenderer } from 'electron'
import type { AiConfig, AiConfigStatus, ChatMessage, PtyWriteResult, SshTarget, StoredWorkspace } from '../shared/types'

export type { AiConfig, AiConfigStatus, ChatMessage, PtyWriteResult, SshTarget, StoredGroup, StoredSession, StoredWorkspace } from '../shared/types'

export interface PtyStartResult {
  sessionId: string
  platform: NodeJS.Platform
  pid: number
  shell: string
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

export type PreviewKind = 'markdown' | 'csv' | 'image' | 'video' | 'pdf' | 'text' | 'none'

export interface FilePreview {
  path: string
  name: string
  kind: PreviewKind
  text?: string
  url?: string
  message?: string
}

export interface WorkspaceContext {
  runtime: string
  directory: string
  branch: string | null
  changes: number
  insertions: number
  deletions: number
}

export interface GitFileChange {
  status: string
  path: string
}

export interface GitDetails {
  directory: string
  branch: string | null
  branches: string[]
  changes: number
  insertions: number
  deletions: number
  files: GitFileChange[]
}

export interface NodeRuntime {
  version: string
  source: string
  binDir: string
  current: boolean
}

export interface ColumnDef {
  key: string
  header: string
  description: string
  detailed?: string
  type?: 'default' | 'numeric' | 'percentage' | 'date'
}

export interface StructuredCommandResult {
  command: string
  columns: ColumnDef[]
  rows: Array<Record<string, string | number>>
  rawOutput: string
}

export interface UnixbridgeApi {
  start: (sessionId: string, cols: number, rows: number, ssh?: SshTarget) => Promise<PtyStartResult>
  write: (sessionId: string, data: string) => Promise<PtyWriteResult>
  resize: (sessionId: string, cols: number, rows: number) => void
  dispose: (sessionId: string) => void
  onData: (listener: (sessionId: string, data: string) => void) => () => void
  onExit: (listener: (sessionId: string, exitCode: number) => void) => () => void
  onRisk: (listener: (sessionId: string, result: PtyWriteResult) => void) => () => void
  approveCommand: (sessionId: string, token: string) => Promise<{ approved: boolean }>
  cancelCommand: (sessionId: string, token: string) => Promise<{ cancelled: boolean }>
  configureAi: (config: AiConfig) => Promise<AiConfigStatus & { configured: true }>
  loadAi: () => Promise<AiConfigStatus | null>
  chat: (messages: ChatMessage[]) => Promise<{ content: string }>
  chatStream: (messages: ChatMessage[], onChunk: (chunk: string) => void) => Promise<void>
  metrics: () => Promise<SystemMetrics>
  listFiles: (path?: string) => Promise<FileListing>
  previewFile: (path: string) => Promise<FilePreview>
  loadSessions: () => Promise<StoredWorkspace>
  saveSessions: (workspace: StoredWorkspace) => Promise<StoredWorkspace>
  structuredCommand: (
    command: string,
    args: string[],
    cwd?: string
  ) => Promise<StructuredCommandResult>
  workspaceContext: (directory?: string) => Promise<WorkspaceContext>
  workspaceGit: (directory?: string) => Promise<GitDetails>
  nodeRuntimes: () => Promise<NodeRuntime[]>
}

const api: UnixbridgeApi = {
  start: (sessionId, cols, rows, ssh) =>
    ipcRenderer.invoke('pty:start', { sessionId, cols, rows, ...(ssh ? { ssh } : {}) }),
  write: (sessionId, data) => {
    if (data.includes('\r') || data.includes('\n')) {
      return ipcRenderer.invoke('pty:submit', { sessionId, data })
    }
    ipcRenderer.send('pty:write', { sessionId, data })
    return Promise.resolve({ action: 'none', ruleId: '', reason: '', line: '' })
  },
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
  onRisk: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string } & PtyWriteResult
    ): void => listener(payload.sessionId, payload)
    ipcRenderer.on('pty:risk', handler)
    return () => ipcRenderer.removeListener('pty:risk', handler)
  },
  approveCommand: (sessionId, token) => ipcRenderer.invoke('pty:approve', { sessionId, token }),
  cancelCommand: (sessionId, token) => ipcRenderer.invoke('pty:cancel', { sessionId, token }),
  configureAi: (config) => ipcRenderer.invoke('ai:configure', config),
  loadAi: () => ipcRenderer.invoke('ai:load'),
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
  previewFile: (path) => ipcRenderer.invoke('files:preview', path),
  loadSessions: () => ipcRenderer.invoke('sessions:load'),
  saveSessions: (workspace) => ipcRenderer.invoke('sessions:save', workspace),
  structuredCommand: (command, args, cwd) =>
    ipcRenderer.invoke('commands:structured', { command, args, cwd }),
  workspaceContext: (directory) => ipcRenderer.invoke('workspace:context', directory),
  workspaceGit: (directory) => ipcRenderer.invoke('workspace:git', directory),
  nodeRuntimes: () => ipcRenderer.invoke('workspace:nodes')
}

contextBridge.exposeInMainWorld('unixbridge', api)
