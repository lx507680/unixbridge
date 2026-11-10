import { describe, expect, it } from 'vitest'
import { formatChangeChip, isSafeBranchName, parseGitStatus, summarizeNumstat } from '../../src/core/workspace/git'
import { sanitizeStoredWorkspace } from '../../src/core/workspace/stored'

describe('工作区上下文', () => {
  it('拒绝会逃出 git 命令的分支名', () => {
    expect(isSafeBranchName('main')).toBe(true)
    expect(isSafeBranchName('feature/ui')).toBe(true)
    expect(isSafeBranchName('main;rm -rf')).toBe(false)
    expect(isSafeBranchName('--force')).toBe(false)
    expect(isSafeBranchName('a..b')).toBe(false)
  })

  it('解析 git 状态和增删行数', () => {
    const files = parseGitStatus(' M src/a.ts\0?? docs/说明.md\0')
    expect(files.map((file) => file.path)).toEqual(['src/a.ts', 'docs/说明.md'])
    expect(summarizeNumstat('12\t3\tsrc/a.ts\n-\t-\tbin.dat\n')).toEqual({
      insertions: 12,
      deletions: 3
    })
    expect(formatChangeChip(1, 2966, 0)).toBe('1 • +2966')
    expect(formatChangeChip(0, 0, 0)).toBe('0 changes')
  })

  it('兼容旧的会话数组，并保留分组', () => {
    const legacy = sanitizeStoredWorkspace([
      { id: '12345678', name: '本地', color: '#73b7c8', kind: 'local' }
    ])
    expect(legacy.groups).toEqual([])
    expect(legacy.sessions).toHaveLength(1)

    const grouped = sanitizeStoredWorkspace({
      groups: [{ id: 'group1234', name: '前端', color: '#d78db5' }],
      sessions: [
        { id: '12345678', name: '本地', color: '#73b7c8', kind: 'local', groupId: 'group1234' },
        { id: '87654321', name: '游离', color: '#73b7c8', kind: 'local', groupId: 'missing12' }
      ]
    })
    expect(grouped.sessions[0]?.groupId).toBe('group1234')
    expect(grouped.sessions[1]?.groupId).toBeUndefined()
  })
})
