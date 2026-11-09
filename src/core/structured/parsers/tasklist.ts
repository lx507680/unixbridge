import type { ColumnDef } from '../../commands/types'
import { columnsFor, outputLines, type CommandParser } from '../types'

const TASKLIST_LINE =
  /^"(?<image>.*)","(?<pid>\d+)","(?<sessionName>.*)","(?<session>\d+)","(?<memory>.*)"$/

const FIELD_ORDER = ['image', 'pid', 'sessionName', 'session', 'memory'] as const

const FIELDS: Readonly<Record<string, ColumnDef>> = {
  image: { key: 'image', header: '映像名称', description: '进程映像', detailed: '进程可执行文件或映像名称，允许包含空格。', type: 'default' },
  pid: { key: 'pid', header: 'PID', description: '进程号', detailed: 'Windows 进程标识符。', type: 'numeric' },
  sessionName: { key: 'sessionName', header: '会话', description: '会话名称', detailed: '进程所在 Windows 会话名称。', type: 'default' },
  session: { key: 'session', header: '会话号', description: '会话编号', detailed: 'Windows 会话编号。', type: 'numeric' },
  memory: { key: 'memory', header: '内存', description: '内存占用', detailed: 'tasklist 报告的内存占用。', type: 'default' }
}

export function createTasklistParser(): CommandParser {
  let rows: Array<Record<string, string>> = []

  return {
    match: (command, platform) => command === 'tasklist' && platform === 'windows',
    parse(raw) {
      rows = outputLines(raw).flatMap((line) => {
        const match = TASKLIST_LINE.exec(line.trim())
        if (!match?.groups) return []
        return [{
          image: match.groups.image ?? '',
          pid: match.groups.pid ?? '',
          sessionName: match.groups.sessionName ?? '',
          session: match.groups.session ?? '',
          memory: match.groups.memory ?? ''
        }]
      })
      return rows
    },
    columns: () => columnsFor(rows, FIELD_ORDER, FIELDS)
  }
}
