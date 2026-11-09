import type { ColumnDef } from '../../commands/types'
import { columnsFor, outputLines, type CommandParser } from '../types'

const PS_AUX_LINE =
  /^(?<user>\S+)\s+(?<pid>\d+)\s+(?<cpu>[\d.]+)\s+(?<mem>[\d.]+)\s+(?<vsz>\d+)\s+(?<rss>\d+)\s+(?<tty>\S+)\s+(?<stat>[A-Za-z+<]+)\s+(?<start>\S+)\s+(?<time>[\d:.]+)\s+(?<command>.+)$/

const FIELD_ORDER = ['USER', 'PID', '%CPU', '%MEM', 'VSZ', 'RSS', 'TT', 'STAT', 'START', 'TIME', 'COMMAND'] as const

const FIELDS: Readonly<Record<string, ColumnDef>> = {
  USER: { key: 'USER', header: 'USER', description: '用户', detailed: '启动该进程的用户。', type: 'default' },
  PID: { key: 'PID', header: 'PID', description: '进程号', detailed: '操作系统分配的进程标识符。', type: 'numeric' },
  '%CPU': { key: '%CPU', header: '%CPU', description: 'CPU 占用', detailed: '进程当前或最近采样周期内的 CPU 使用率。', type: 'percentage' },
  '%MEM': { key: '%MEM', header: '%MEM', description: '内存占用', detailed: '进程常驻内存占系统物理内存的百分比。', type: 'percentage' },
  VSZ: { key: 'VSZ', header: 'VSZ', description: '虚拟内存', detailed: '进程虚拟地址空间大小，单位通常为 KiB。', type: 'numeric' },
  RSS: { key: 'RSS', header: 'RSS', description: '常驻内存', detailed: '当前驻留在物理内存中的大小，单位通常为 KiB。', type: 'numeric' },
  TT: { key: 'TT', header: 'TT', description: '终端', detailed: '进程关联的终端；?? 表示没有控制终端。', type: 'default' },
  STAT: { key: 'STAT', header: 'STAT', description: '进程状态', detailed: '进程状态，如 R 运行、S 休眠、Z 僵尸。', type: 'default' },
  START: { key: 'START', header: 'START', description: '启动时间', detailed: '进程启动时间。', type: 'date' },
  TIME: { key: 'TIME', header: 'TIME', description: 'CPU 时间', detailed: '进程累计消耗的 CPU 时间。', type: 'default' },
  COMMAND: { key: 'COMMAND', header: 'COMMAND', description: '命令', detailed: '启动进程的完整命令行。', type: 'default' }
}

const GROUP_TO_FIELD = [
  ['user', 'USER'],
  ['pid', 'PID'],
  ['cpu', '%CPU'],
  ['mem', '%MEM'],
  ['vsz', 'VSZ'],
  ['rss', 'RSS'],
  ['tty', 'TT'],
  ['stat', 'STAT'],
  ['start', 'START'],
  ['time', 'TIME'],
  ['command', 'COMMAND']
] as const

export function createPsParser(): CommandParser {
  let rows: Array<Record<string, string>> = []

  return {
    match: (command, platform) =>
      command === 'ps' && (platform === 'mac' || platform === 'linux'),
    parse(raw) {
      rows = outputLines(raw).flatMap((line) => {
        if (/^USER\s+/.test(line)) return []
        const match = PS_AUX_LINE.exec(line.trim())
        if (!match?.groups) return []
        return [Object.fromEntries(GROUP_TO_FIELD.map(([group, field]) => [field, match.groups?.[group] ?? '']))]
      })
      return rows
    },
    columns: () => columnsFor(rows, FIELD_ORDER, FIELDS)
  }
}
