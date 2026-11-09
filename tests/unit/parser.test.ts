import { describe, expect, it } from 'vitest'
import { parseCommandLine } from '../../src/core/parser'

describe('parseCommandLine', () => {
  it('parses flags, pipeline and redirect without shell evaluation', () => {
    const result = parseCommandLine('ls -la | grep "hello world" > out.txt')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ast.kind).toBe('pipeline')
    if (result.ast.kind !== 'pipeline') return
    expect(result.ast.commands[0]).toMatchObject({
      kind: 'command',
      name: 'ls',
      args: ['-la'],
      flags: { l: true, a: true }
    })
    expect(result.ast.commands[1]).toMatchObject({
      kind: 'redirect',
      redirects: [{ operator: '>', target: 'out.txt' }]
    })
  })

  it('honors logical precedence before sequence', () => {
    const result = parseCommandLine('pwd && echo ok || echo no; env')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ast.kind).toBe('sequence')
  })

  it('rejects intentionally unsupported shell grammar', () => {
    const result = parseCommandLine('echo $(whoami)')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('UNSUPPORTED_SYNTAX')
  })

  it('reports an unclosed quote', () => {
    const result = parseCommandLine('grep "hello')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('UNCLOSED_QUOTE')
  })

  it('preserves Windows drive and UNC path separators', () => {
    const driveResult = parseCommandLine('cat C:\\Users\\tester\\notes.txt')
    expect(driveResult.ok).toBe(true)
    if (driveResult.ok && driveResult.ast.kind === 'command') {
      expect(driveResult.ast.args).toEqual(['C:\\Users\\tester\\notes.txt'])
    }

    const uncResult = parseCommandLine('ls "\\\\server\\share\\project files"')
    expect(uncResult.ok).toBe(true)
    if (uncResult.ok && uncResult.ast.kind === 'command') {
      expect(uncResult.ast.args).toEqual(['\\\\server\\share\\project files'])
    }
  })
})
