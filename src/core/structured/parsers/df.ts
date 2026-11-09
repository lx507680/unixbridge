import type { ColumnDef } from '../../commands/types'
import { columnsFor, outputLines, type CommandParser } from '../types'

const DF_LINE =
  /^(?<filesystem>.+?)\s+(?<size>\S+)\s+(?<used>\S+)\s+(?<avail>\S+)\s+(?<use>\d+%)\s+(?<rest>.+)$/

const DF_MAC_REST =
  /^(?<iused>\S+)\s+(?<ifree>\S+)\s+(?<ipct>\d+%)\s+(?<mounted>.+)$/

const FIELD_ORDER = ['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'iused', 'ifree', '%iused', 'Mounted-on'] as const

const FIELDS: Readonly<Record<string, ColumnDef>> = {
  Filesystem: { key: 'Filesystem', header: 'Filesystem', description: '文件系统', detailed: '磁盘、卷或文件系统设备名称。', type: 'default' },
  Size: { key: 'Size', header: 'Size', description: '总容量', detailed: '文件系统总容量。', type: 'numeric' },
  Used: { key: 'Used', header: 'Used', description: '已使用', detailed: '已经使用的空间。', type: 'numeric' },
  Avail: { key: 'Avail', header: 'Avail', description: '可用空间', detailed: '当前仍可使用的空间。', type: 'numeric' },
  'Use%': { key: 'Use%', header: 'Use%', description: '使用率', detailed: '已使用空间占总容量的百分比。', type: 'percentage' },
  iused: { key: 'iused', header: 'iused', description: '已用 inode', detailed: '当前平台输出中实际出现的已用 inode 数。', type: 'numeric' },
  ifree: { key: 'ifree', header: 'ifree', description: '可用 inode', detailed: '当前平台输出中实际出现的可用 inode 数。', type: 'numeric' },
  '%iused': { key: '%iused', header: '%iused', description: 'inode 使用率', detailed: '当前平台输出中实际出现的 inode 使用率。', type: 'percentage' },
  'Mounted-on': { key: 'Mounted-on', header: 'Mounted-on', description: '挂载点', detailed: '文件系统在目录树中的挂载位置或 Windows 盘符。', type: 'default' }
}

export function createDfParser(): CommandParser {
  let rows: Array<Record<string, string>> = []

  return {
    match: (command) => command === 'df',
    parse(raw) {
      rows = outputLines(raw).flatMap((line) => {
        if (/^Filesystem\b/.test(line)) return []
        const match = DF_LINE.exec(line.trim())
        if (!match?.groups) return []
        const mac = DF_MAC_REST.exec(match.groups.rest ?? '')
        const row: Record<string, string> = {
          Filesystem: match.groups.filesystem ?? '',
          Size: match.groups.size ?? '',
          Used: match.groups.used ?? '',
          Avail: match.groups.avail ?? '',
          'Use%': match.groups.use ?? '',
          'Mounted-on': mac?.groups?.mounted ?? match.groups.rest ?? ''
        }
        if (mac?.groups) {
          row.iused = mac.groups.iused ?? ''
          row.ifree = mac.groups.ifree ?? ''
          row['%iused'] = mac.groups.ipct ?? ''
        }
        return [row]
      })
      return rows
    },
    columns: () => columnsFor(rows, FIELD_ORDER, FIELDS)
  }
}
