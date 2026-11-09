import { describe, expect, it } from 'vitest'
import { createDefaultRegistry } from '../../src/core/commands'

describe('command registry', () => {
  it('exposes the explicit MVP whitelist and executable ls', () => {
    const registry = createDefaultRegistry()

    expect(registry.resolve('pwd')?.schema.builtin).toBe(true)
    expect(registry.resolve('ls')?.execute).toBeTypeOf('function')
    expect(registry.resolve('awk')).toBeUndefined()
    expect(registry.list().map((command) => command.schema.name)).toContain('kill')
  })
})
