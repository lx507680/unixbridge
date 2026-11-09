import { describe, expect, it } from 'vitest'
import { RiskPolicy } from '../../src/core/dispatch/risk-policy'
import { parseCommandLine } from '../../src/core/parser'

function context(input: string) {
  const parsed = parseCommandLine(input)
  return {
    rawInput: input,
    ...(parsed.ok ? { ast: parsed.ast } : {}),
    cwd: 'C:\\Users\\tester',
    platform: 'win32' as const
  }
}

describe('RiskPolicy', () => {
  const policy = new RiskPolicy()

  it('requires confirmation for rm -rf', () => {
    expect(policy.evaluate(context('rm -rf node_modules'))).toMatchObject({
      action: 'confirm',
      ruleId: 'confirm-rm-recursive-force',
      irreversible: true
    })
  })

  it('denies destructive Windows commands', () => {
    expect(policy.evaluate(context('reg delete HKCU\\Software\\Demo'))).toMatchObject({
      action: 'deny',
      ruleId: 'deny-reg-delete'
    })
  })

  it('requires confirmation before writing Windows system paths', () => {
    expect(policy.evaluate(context('echo bad > C:\\Windows\\demo.txt'))).toMatchObject({
      action: 'confirm',
      ruleId: 'confirm-system-path-write'
    })
  })

  it('allows low-risk builtin commands', () => {
    expect(policy.evaluate(context('ls -la'))).toMatchObject({
      action: 'allow',
      ruleId: 'default-allow'
    })
  })
})
