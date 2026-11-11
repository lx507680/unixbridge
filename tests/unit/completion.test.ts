import { describe, expect, it } from 'vitest'
import {
  completePathToken,
  explainCommandProblem,
  joinCompletionDirectory,
  pathCompletionQuery,
  suggestCommands
} from '../../src/core/completion/commands'

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

  it('补全命令后面的文件名，跳过选项', () => {
    expect(pathCompletionQuery('git status')).toEqual({ parent: '', prefix: 'status' })
    expect(pathCompletionQuery('cat READ')).toEqual({ parent: '', prefix: 'READ' })
    expect(pathCompletionQuery('cat src/re')).toEqual({ parent: 'src', prefix: 're' })
    expect(pathCompletionQuery('ls -la')).toBeUndefined()
    expect(joinCompletionDirectory('/work/app', 'src')).toBe('/work/app/src')
    expect(joinCompletionDirectory('C:\\work', 'src')).toBe('C:\\work\\src')
    expect(pathCompletionQuery("cat 'My Dir/")).toEqual({ parent: 'My Dir', prefix: '' })
    expect(completePathToken('cat READ', 'README.md', 'file', 'posix')).toBe('cat README.md')
    expect(completePathToken('cat READ', 'My Notes.md', 'file', 'posix')).toBe("cat 'My Notes.md'")
    expect(completePathToken('cat src/', 'lib', 'directory', 'posix')).toBe('cat src/lib/')
    expect(completePathToken("cat 'My Dir/", 'notes', 'directory', 'posix')).toBe("cat 'My Dir/notes/'")
    expect(completePathToken('cat src\\', 'lib', 'directory', 'win32')).toBe('cat src\\lib\\')
    expect(pathCompletionQuery("cat src/'My Dir/")).toEqual({ parent: 'src/My Dir', prefix: '' })
  })

  it('把常见 shell 错误收成一句说明', () => {
    expect(explainCommandProblem('zsh: command not found: typo')).toBe('当前 shell 找不到这个命令。')
    expect(explainCommandProblem('ls: nope: No such file or directory')).toBe('路径不存在。')
    expect(explainCommandProblem('total 8\na.txt')).toBeUndefined()
  })
})
