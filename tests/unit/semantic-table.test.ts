import { describe, expect, it } from 'vitest'
import { displayWidth, outputIncludesHeader, renderSemanticTable } from '../../src/core/output'
import { createLsParser } from '../../src/core/structured'

const columns = [
  {
    key: 'name',
    header: '名称',
    description: '文件名',
    detailed: '文件或目录的显示名称。'
  },
  {
    key: 'size',
    header: 'SIZE',
    description: '大小',
    detailed: '文件占用的字节数。',
    type: 'numeric' as const
  }
]

function characterAtDisplay(value: string, displayIndex: number): string {
  let used = 0
  for (const character of value) {
    if (used === displayIndex) return character
    used += displayWidth(character)
  }
  return ''
}

describe('semantic table renderer', () => {
  it('measures CJK characters by terminal display width', () => {
    expect(displayWidth('名称')).toBe(4)
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('目录A')).toBe(5)
  })

  it('renders an ANSI red header, dim legend and aligned rows', () => {
    const rendered = renderSemanticTable(columns, [
      { name: 'a.txt', size: 6 },
      { name: '目录', size: 1024 }
    ])
    const lines = rendered.text.split('\r\n')

    expect(lines[0]).toContain('\u001b[1;31m名称')
    expect(lines[1]).toContain('\u001b[2;37m文件')
    expect(lines[1]).not.toContain(' · ')
    expect(lines[2]).toBe('a.txt    6')
    expect(lines[3]).toBe('目录  1024')
    expect(rendered.text).not.toContain('文件或目录的显示名称。')
  })

  it('aligns the legend to the raw output columns', () => {
    const raw = [
      'drwxr-xr-x   4 luoxian  staff   128 Jan  6  2026 flutter',
      '-rw-r--r--   1 luoxian  staff    96 Oct  3  2025 readme.md'
    ].join('\n')
    const parser = createLsParser()
    const rows = parser.parse(raw)
    const rendered = renderSemanticTable(parser.columns(), rows, false, raw)
    const owner = rendered.layout.find((column) => column.key === 'owner')
    const firstOwner = displayWidth((raw.split('\n')[0] ?? '').slice(0, raw.indexOf('luoxian')))
    expect(owner?.start).toBe(firstOwner)
    expect(characterAtDisplay(rendered.legendText, owner?.start ?? 0)).toBe('所')
    expect(characterAtDisplay(rendered.headerText, owner?.start ?? 0)).toBe('所')
    expect(rendered.headerText).toContain('链接')
    expect(rendered.headerText).toContain('用户组')
    expect(rendered.headerText).not.toContain('…')
    expect(rendered.legendText).not.toContain(' · ')
  })

  it('detects a header the command already printed', () => {
    const columns = [
      { key: 'PID', header: 'PID', description: '进程号' },
      { key: 'TTY', header: 'TTY', description: '终端' },
      { key: 'TIME', header: 'TIME', description: 'CPU 时间' }
    ]
    expect(outputIncludesHeader('  PID TTY           TIME CMD\n18127 ttys000 0:00.28 zsh\n', columns)).toBe(true)
    expect(outputIncludesHeader('drwxr-xr-x  4 luoxian staff 128 Jan 6 2026 flutter\n', columns)).toBe(false)
  })

  it('keeps spaces between adjacent headers', () => {
    const rendered = renderSemanticTable(
      [
        { key: 'PID', header: 'PID', description: '进程号', type: 'numeric' },
        { key: '%CPU', header: '%CPU', description: 'CPU 占用', type: 'percentage' }
      ],
      [{ PID: '18127', '%CPU': '0.1' }],
      false,
      'luoxian 18127 0.1 0.2 1 2 ?? S 1:00 0:00.01 zsh'
    )
    expect(rendered.headerText).not.toContain('PID%CPU')
  })

  it('expands detailed descriptions when requested', () => {
    const rendered = renderSemanticTable(columns, [{ name: 'a.txt', size: 6 }], true)
    expect(rendered.text).toContain('名称 (name)')
    expect(rendered.text).toContain('文件或目录的显示名称。')
    expect(rendered.details).toContain('SIZE (size)')
  })
})
