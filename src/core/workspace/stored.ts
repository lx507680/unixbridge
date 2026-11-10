import { parseSshTarget, type SshTarget } from '../ssh/target'

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

const ID_PATTERN = /^[a-zA-Z0-9-]{8,80}$/
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

function sanitizeSessions(input: unknown): StoredSession[] {
  if (!Array.isArray(input)) return []
  const sessions: StoredSession[] = []
  for (const item of input.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Partial<StoredSession>
    const id = String(record.id ?? '')
    if (!ID_PATTERN.test(id)) continue
    const name = String(record.name ?? '').trim().slice(0, 30) || '未命名会话'
    const color = COLOR_PATTERN.test(String(record.color ?? '')) ? String(record.color) : '#73b7c8'
    const groupId = ID_PATTERN.test(String(record.groupId ?? '')) ? String(record.groupId) : undefined
    if (record.kind === 'ssh') {
      const ssh = parseSshTarget(
        `${record.ssh?.user ? `${record.ssh.user}@` : ''}${record.ssh?.host ?? ''}${
          record.ssh?.port && record.ssh.port !== 22 ? `:${record.ssh.port}` : ''
        }`
      )
      if (!ssh) continue
      sessions.push({ id, name, color, kind: 'ssh', ssh, ...(groupId ? { groupId } : {}) })
      continue
    }
    sessions.push({ id, name, color, kind: 'local', ...(groupId ? { groupId } : {}) })
  }
  return sessions
}

function sanitizeGroups(input: unknown): StoredGroup[] {
  if (!Array.isArray(input)) return []
  const groups: StoredGroup[] = []
  for (const item of input.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Partial<StoredGroup>
    const id = String(record.id ?? '')
    if (!ID_PATTERN.test(id) || groups.some((group) => group.id === id)) continue
    groups.push({
      id,
      name: String(record.name ?? '').trim().slice(0, 30) || '未命名分组',
      color: COLOR_PATTERN.test(String(record.color ?? '')) ? String(record.color) : '#8f83d8'
    })
  }
  return groups
}

export function sanitizeStoredWorkspace(input: unknown): StoredWorkspace {
  if (Array.isArray(input)) return { sessions: sanitizeSessions(input), groups: [] }
  if (!input || typeof input !== 'object') return { sessions: [], groups: [] }
  const record = input as { sessions?: unknown; groups?: unknown }
  const groups = sanitizeGroups(record.groups)
  const groupIds = new Set(groups.map((group) => group.id))
  const sessions = sanitizeSessions(record.sessions).map((session) => {
    if (!session.groupId || groupIds.has(session.groupId)) return session
    const { groupId: _removed, ...rest } = session
    return rest
  })
  return { sessions, groups }
}
