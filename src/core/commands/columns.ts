import type { ColumnDef } from './types'

export const lsColumns: readonly ColumnDef[] = [
  {
    key: 'mode',
    header: '权限',
    description: '类型与权限',
    detailed:
      '第 1 位表示类型（d 目录、l 链接、- 文件）；随后每 3 位依次是所有者、用户组、其他用户的 r 读、w 写、x 执行权限。',
    type: 'default'
  },
  { key: 'links', header: '链接', description: '硬链接数', detailed: '文件的硬链接数量；目录通常至少为 2。', type: 'numeric' },
  { key: 'owner', header: '所有者', description: '所属用户', detailed: '拥有该文件或目录的用户。', type: 'default' },
  { key: 'group', header: '用户组', description: '所属组', detailed: '拥有该文件或目录的用户组。', type: 'default' },
  { key: 'size', header: '大小', description: '字节/易读大小', detailed: '默认显示字节；使用 -h 后显示 K、M、G 等易读单位。', type: 'numeric' },
  { key: 'mtime', header: '修改时间', description: '最后修改', detailed: '文件内容或目录条目最后一次发生变化的时间。', type: 'date' },
  { key: 'name', header: '名称', description: '文件名', detailed: '文件、目录或符号链接的名称；目录以 / 结尾。', type: 'default' }
]

export const psColumns: readonly ColumnDef[] = [
  { key: 'USER', header: 'USER', description: '用户', detailed: '启动该进程的用户。', type: 'default' },
  { key: 'PID', header: 'PID', description: '进程号', detailed: '操作系统分配的进程标识符。', type: 'numeric' },
  { key: '%CPU', header: '%CPU', description: 'CPU 占用', detailed: '进程当前或最近采样周期内的 CPU 使用率。', type: 'percentage' },
  { key: '%MEM', header: '%MEM', description: '内存占用', detailed: '进程常驻内存占系统物理内存的百分比。', type: 'percentage' },
  { key: 'VSZ', header: 'VSZ', description: '虚拟内存', detailed: '进程虚拟地址空间大小，单位通常为 KiB。', type: 'numeric' },
  { key: 'RSS', header: 'RSS', description: '常驻内存', detailed: '当前驻留在物理内存中的大小，单位通常为 KiB。', type: 'numeric' },
  { key: 'STAT', header: 'STAT', description: '进程状态', detailed: '进程状态，如 R 运行、S 休眠、Z 僵尸。', type: 'default' },
  { key: 'START', header: 'START', description: '启动时间', detailed: '进程启动时间。', type: 'date' },
  { key: 'TIME', header: 'TIME', description: 'CPU 时间', detailed: '进程累计消耗的 CPU 时间。', type: 'default' },
  { key: 'COMMAND', header: 'COMMAND', description: '命令', detailed: '启动进程的命令或可执行文件名称。', type: 'default' }
]

export const dfColumns: readonly ColumnDef[] = [
  { key: 'Filesystem', header: 'Filesystem', description: '文件系统', detailed: '磁盘、卷或文件系统设备名称。', type: 'default' },
  { key: 'Size', header: 'Size', description: '总容量', detailed: '文件系统总容量。', type: 'numeric' },
  { key: 'Used', header: 'Used', description: '已使用', detailed: '已经使用的空间。', type: 'numeric' },
  { key: 'Avail', header: 'Avail', description: '可用空间', detailed: '当前仍可使用的空间。', type: 'numeric' },
  { key: 'Use%', header: 'Use%', description: '使用率', detailed: '已使用空间占总容量的百分比。', type: 'percentage' },
  { key: 'Mounted-on', header: 'Mounted-on', description: '挂载点', detailed: '文件系统在目录树中的挂载位置或 Windows 盘符。', type: 'default' }
]
