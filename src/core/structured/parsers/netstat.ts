import type { ColumnDef } from '../../commands/types'
import { columnsFor, outputLines, type CommandParser } from '../types'

const NETSTAT_LINE =
  /^\s*(?<proto>TCP|UDP)\s+(?<local>\S+)\s+(?<foreign>\S+)\s+(?:(?<state>LISTENING|ESTABLISHED|TIME_WAIT|CLOSE_WAIT|FIN_WAIT_\d|SYN_SENT|SYN_RECEIVED|LAST_ACK|CLOSING)\s+)?(?<pid>\d+)\s*$/

const FIELD_ORDER = ['proto', 'local', 'foreign', 'state', 'pid'] as const

const FIELDS: Readonly<Record<string, ColumnDef>> = {
  proto: { key: 'proto', header: '协议', description: '传输协议', detailed: 'TCP 或 UDP。', type: 'default' },
  local: { key: 'local', header: '本地地址', description: '本机地址与端口', detailed: '本机监听或连接使用的地址和端口。', type: 'default' },
  foreign: { key: 'foreign', header: '外部地址', description: '远端地址与端口', detailed: '连接对端地址；监听状态通常为 0.0.0.0:0 或 *:*。', type: 'default' },
  state: { key: 'state', header: '状态', description: '连接状态', detailed: 'TCP 连接状态，例如 LISTENING、ESTABLISHED。UDP 行没有该列。', type: 'default' },
  pid: { key: 'pid', header: 'PID', description: '进程号', detailed: '拥有该套接字的进程标识符。', type: 'numeric' }
}

export function createNetstatParser(): CommandParser {
  let rows: Array<Record<string, string>> = []

  return {
    match: (command, platform) => command === 'netstat' && platform === 'windows',
    parse(raw) {
      rows = outputLines(raw).flatMap((line) => {
        const match = NETSTAT_LINE.exec(line)
        if (!match?.groups) return []
        const row: Record<string, string> = {
          proto: match.groups.proto ?? '',
          local: match.groups.local ?? '',
          foreign: match.groups.foreign ?? '',
          pid: match.groups.pid ?? ''
        }
        if (match.groups.state) row.state = match.groups.state
        return [row]
      })
      return rows
    },
    columns: () => columnsFor(rows, FIELD_ORDER, FIELDS)
  }
}
