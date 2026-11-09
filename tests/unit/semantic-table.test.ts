import { describe, expect, it } from 'vitest'
import { displayWidth, renderSemanticTable } from '../../src/core/output'

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
    detailed: '文件占用的字节数。'
  }
]

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
    expect(lines[1]).toContain('\u001b[2;37mname: 文件名')
    expect(lines[2]).toBe('a.txt  6')
    expect(lines[3]).toBe('目录   1024')
    expect(rendered.text).not.toContain('文件或目录的显示名称。')
  })

  it('expands detailed descriptions when requested', () => {
    const rendered = renderSemanticTable(columns, [{ name: 'a.txt', size: 6 }], true)
    expect(rendered.text).toContain('名称 (name)')
    expect(rendered.text).toContain('文件或目录的显示名称。')
    expect(rendered.details).toContain('SIZE (size)')
  })
})
