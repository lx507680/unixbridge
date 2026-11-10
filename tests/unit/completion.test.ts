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

  it('可以分别关闭常用命令和历史命令', () => {
    const historyOnly = suggestCommands('git ', ['git status', 'npm test'], {
      commands: false,
      history: true
    })
    expect(historyOnly.map((item) => item.command)).toEqual(['git status'])
    expect(historyOnly[0]?.description).toBe('历史命令')

    const commandsOnly = suggestCommands('git ', ['git status'], { commands: true, history: false })
    expect(commandsOnly.map((item) => item.command)).toContain('git diff')
    expect(commandsOnly.some((item) => item.description === '历史命令')).toBe(false)

    expect(suggestCommands('git ', ['git status'], { commands: false, history: false })).toEqual([])
  })
})
