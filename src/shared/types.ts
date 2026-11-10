export interface AiConfig {
  provider: 'local' | 'api'
  endpoint: string
  model: string
  apiKey?: string
}

export interface AiConfigStatus {
  provider: 'local' | 'api'
  endpoint: string
  model: string
  hasApiKey: boolean
  encryptionAvailable: boolean
  persisted: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SshTarget {
  user: string
  host: string
  port: number
}

export interface StoredSession {
  id: string
  name: string
  color: string
  kind: 'local' | 'ssh'
  ssh?: SshTarget
  groupId?: string
}

export interface StoredGroup {
  id: string
  name: string
  color: string
}

export interface StoredWorkspace {
  sessions: StoredSession[]
  groups: StoredGroup[]
}

export type PtyRiskAction = 'allow' | 'warn' | 'confirm' | 'deny' | 'none'

export interface PtyWriteResult {
  action: PtyRiskAction
  ruleId: string
  reason: string
  line: string
  token?: string
}
