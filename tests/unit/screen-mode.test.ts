import { describe, expect, it } from 'vitest'
import { createPtyGateState, gatePtyChunk } from '../../src/core/dispatch/pty-gate'
import { collectCommandOutput, presentCommandOutput, scanTerminalOutput } from '../../src/core/terminal/screen-mode'

describe('terminal screen mode', () => {
  it('tracks the prompt, a running command, and full-screen programs', () => {
    const started = scanTerminalOutput('running', 'ready \x1b]133;A\x07$ ')
    expect(started.mode).toBe('prompt')
    expect(started.sawPrompt).toBe(true)
    expect(started.output).toBe('ready $ ')

    const running = scanTerminalOutput('prompt', '\x1b]133;C\x07')
    expect(running.mode).toBe('running')
    expect(running.output).toBe('')

    const editor = scanTerminalOutput('prompt', '\x1b[?1049h')
    expect(editor.mode).toBe('application')
    expect(editor.output).toBe('\x1b[?1049h')
    expect(scanTerminalOutput('application', '\x1b[?1049l\x1b]133;A\x07').mode).toBe('prompt')
  })

  it('keeps a prompt marker that arrives in two chunks', () => {
    const head = scanTerminalOutput('running', 'done\x1b]133;')
    expect(head.mode).toBe('running')
    expect(head.pending).toBe('\x1b]133;')
    expect(head.output).toBe('done')
    const tail = scanTerminalOutput(head.mode, `${head.pending}A\x07$ `)
    expect(tail.mode).toBe('prompt')
    expect(tail.output).toBe('$ ')
    expect(tail.pending).toBe('')
  })

  it('keeps only the text between command start and the next prompt', () => {
    const collected = collectCommandOutput(
      '',
      false,
      'echo rm\r\n\x1b]133;C\x07usage: rm\r\n\x1b]133;A\x07luoxian@host % '
    )
    expect(collected.capturing).toBe(false)
    expect(presentCommandOutput(collected.output)).toBe('usage: rm')
  })
})

describe('prompt line rewrite', () => {
  it('checks the rewritten line instead of the shell history key', () => {
    const state = createPtyGateState()
    const options = { cwd: '/tmp', platform: 'darwin' as const, createToken: () => 'tok' }
    gatePtyChunk(state, 'ls', options)
    const submitted = gatePtyChunk(state, '\u0001\u000brm -rf temp\r', options)
    expect(submitted.line).toBe('rm -rf temp')
    expect(submitted.decision?.action).toBe('confirm')
    expect(submitted.forward.includes('\r')).toBe(false)
  })
})
