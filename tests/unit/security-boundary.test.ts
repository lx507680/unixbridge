import { mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPrivateOrLocalHost, normalizeAiEndpoint } from '../../src/core/ai/endpoint'
import { assessSubmittedLine } from '../../src/core/dispatch'
import {
  MAX_PTY_CHUNK,
  cancelConfirmedLine,
  createPtyGateState,
  gatePtyChunk,
  releaseConfirmedLine
} from '../../src/core/dispatch/pty-gate'
import { resolveHomePath } from '../../src/core/path'

describe('command dispatch gate', () => {
  it('asks before a recursive force delete and only then releases the enter key', () => {
    const state = createPtyGateState()
    const options = { cwd: '/tmp', platform: 'darwin' as const, createToken: () => 'tok' }
    expect(gatePtyChunk(state, 'rm -rf temp', options).forward).toBe('rm -rf temp')
    const submitted = gatePtyChunk(state, '\r', options)
    expect(submitted.forward).toBe('')
    expect(submitted.decision).toMatchObject({ action: 'confirm', ruleId: 'confirm-rm-recursive-force' })
    expect(submitted.token).toBe('tok')
    expect(releaseConfirmedLine(state, 'tok')).toEqual({ data: '\r', line: 'rm -rf temp' })
  })

  it('cancels a denied command before the shell can run it', () => {
    const result = gatePtyChunk(createPtyGateState(), 'reg delete HKCU\\Software\\Demo\r', {
      cwd: 'C:\\Users\\tester',
      platform: 'win32'
    })
    expect(result.decision?.action).toBe('deny')
    expect(result.forward.includes('\r')).toBe(false)
    expect(result.forward.endsWith('\u0003')).toBe(true)
  })

  it('lets an ordinary command through and rejects an oversized write', () => {
    const allowed = gatePtyChunk(createPtyGateState(), 'ls -la\r', { cwd: '/tmp', platform: 'darwin' })
    expect(allowed.forward).toBe('ls -la\r')
    expect(allowed.decision).toMatchObject({ action: 'allow', knownCommand: true })

    const oversized = gatePtyChunk(createPtyGateState(), 'a'.repeat(MAX_PTY_CHUNK + 1))
    expect(oversized.forward).toBe('')
    expect(oversized.decision?.ruleId).toBe('deny-oversized-write')
  })

  it('confirms rm -rf even when command substitution prevents a full parse', () => {
    expect(assessSubmittedLine('rm -rf $(pwd)', '/tmp', 'darwin')).toMatchObject({
      action: 'confirm',
      ruleId: 'confirm-rm-recursive-force'
    })
    const state = createPtyGateState()
    gatePtyChunk(state, 'rm -rf temp\r', { cwd: '/tmp', platform: 'darwin', createToken: () => 'tok' })
    expect(cancelConfirmedLine(state, 'tok')?.data).toBe('\u0003')
  })
})

describe('home path sandbox', () => {
  it('rejects a symlink that points outside the home directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ub-home-'))
    const outside = await mkdtemp(path.join(tmpdir(), 'ub-out-'))
    await writeFile(path.join(outside, 'secret.txt'), 'nope')
    await writeFile(path.join(root, 'note.txt'), 'ok')
    await symlink(outside, path.join(root, 'escape'))

    const home = await resolveHomePath(undefined, root)
    await expect(resolveHomePath('note.txt', root)).resolves.toBe(path.join(home, 'note.txt'))
    await expect(resolveHomePath('missing/file', root)).resolves.toBe(path.join(home, 'missing', 'file'))
    await expect(resolveHomePath('escape', root)).rejects.toThrow('当前用户目录')
    await expect(resolveHomePath(path.join(outside, 'secret.txt'), root)).rejects.toThrow('当前用户目录')
  })
})

describe('AI endpoint policy', () => {
  it('allows a local loopback endpoint and blocks it for API mode', () => {
    expect(isPrivateOrLocalHost('127.0.0.1')).toBe(true)
    expect(normalizeAiEndpoint('http://127.0.0.1:11434/v1', 'local')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions'
    )
    expect(() => normalizeAiEndpoint('http://127.0.0.1:11434/v1', 'api')).toThrow('内网')
    expect(() => normalizeAiEndpoint('https://user:secret@api.example.com/v1', 'api')).toThrow('密码')
    expect(normalizeAiEndpoint('https://api.example.com/v1', 'api')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
  })
})
