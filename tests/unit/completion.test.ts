import { describe, expect, it } from 'vitest'
import { suggestCommands } from '../../src/core/completion/commands'

describe('常用命令补全', () => {
  it('按已输入前缀给出常用命令和历史命令', () => {
    const suggestions = suggestCommands('git ', ['git status', 'npm test'])
    expect(suggestions.map((item) => item.command)).toContain('git status')
    expect(suggestions.map((item) => item.command)).toContain('git diff')
    expect(suggestions.some((item) => item.command === 'npm test')).toBe(false)
  })

  it('不重复已经完整输入的命令', () => {
    expect(suggestCommands('ls -la', []).some((item) => item.command === 'ls -la')).toBe(false)
    expect(suggestCommands('ls', []).some((item) => item.command === 'ls -la')).toBe(true)
  })

  it('空输入不弹出补全', () => {
    expect(suggestCommands('   ', ['ls'])).toEqual([])
  })
})
