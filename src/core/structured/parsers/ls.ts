import type { ColumnDef } from '../../commands/types'
import { columnsFor, outputLines, type CommandParser, type StructuredPlatform } from '../types'

const LONG_LINE =
  /^(?<mode>[-dlcbps][-rwxXsStT]{9}[@+.]*)\s+(?<links>\d+)\s+(?<owner>\S+)\s+(?<group>\S+)\s+(?<size>(?:\d+,\s*)?\d+[KMGTPE]?(?:[iB])?)\s+(?<mtime>(?:\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})|(?:\d{1,2}月\s*\d{1,2}日\s+\d{2}:\d{2})|(?:[A-Z][a-z]{2}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})))\s+(?<name>.+)$/

const FIELD_ORDER = ['mode', 'links', 'owner', 'group', 'size', 'mtime', 'name'] as const

const FIELDS: Readonly<Record<string, ColumnDef>> = {
  mode: {
    key: 'mode',
    header: '权限',
    description: '类型与权限',
    detailed:
      '第 1 位表示类型（d 目录、l 链接、- 文件）；随后每 3 位依次是所有者、用户组、其他用户的 r 读、w 写、x 执行权限。',
    type: 'default'
  },
  links: { key: 'links', header: '链接', description: '硬链接数', detailed: '文件的硬链接数量；目录通常至少为 2。', type: 'numeric' },
  owner: { key: 'owner', header: '所有者', description: '所属用户', detailed: '拥有该文件或目录的用户。', type: 'default' },
  group: { key: 'group', header: '用户组', description: '所属组', detailed: '拥有该文件或目录的用户组。', type: 'default' },
  size: { key: 'size', header: '大小', description: '字节/易读大小', detailed: '默认显示字节；使用 -h 后显示 K、M、G 等易读单位。', type: 'numeric' },
  mtime: { key: 'mtime', header: '修改时间', description: '最后修改', detailed: '文件内容或目录条目最后一次发生变化的时间。', type: 'date' },
  name: { key: 'name', header: '名称', description: '文件名', detailed: '文件、目录或符号链接的名称；符号链接保留 -> 目标。', type: 'default' }
}

export function createLsParser(): CommandParser {
  let rows: Array<Record<string, string>> = []

  return {
    match: (command) => command === 'ls',
    parse(raw) {
      const longRows = outputLines(raw).flatMap((line) => {
        if (/^total\s+\d+/.test(line)) return []
        const match = LONG_LINE.exec(line)
        if (!match?.groups) return []
        return [Object.fromEntries(FIELD_ORDER.map((key) => [key, match.groups?.[key] ?? '']))]
      })
      rows = longRows.length > 0
        ? longRows
        : outputLines(raw).map((line) => ({ name: line }))
      return rows
    },
    columns: () => columnsFor(rows, rows[0] && !('mode' in rows[0]) ? ['name'] : FIELD_ORDER, FIELDS)
  }
}

export function supportsLs(platform: StructuredPlatform): boolean {
  return platform === 'mac' || platform === 'linux' || platform === 'windows'
}
