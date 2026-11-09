import { describe, expect, it } from 'vitest'
import { createDefaultRegistry } from '../../src/core/commands'

describe('command registry', () => {
  it('exposes the explicit MVP whitelist and executable ls', () => {
    const registry = createDefaultRegistry()

    expect(registry.resolve('pwd')?.schema.builtin).toBe(true)
    expect(registry.resolve('ls')?.execute).toBeTypeOf('function')
    expect(registry.resolve('ls')?.schema.columns?.map((column) => column.key)).toEqual([
      'mode', 'links', 'owner', 'group', 'size', 'mtime', 'name'
    ])
    expect(registry.resolve('ps')?.schema.columns).toHaveLength(10)
    expect(registry.resolve('df')?.schema.columns).toHaveLength(6)
    expect(registry.resolve('awk')).toBeUndefined()
    expect(registry.list().map((command) => command.schema.name)).toContain('kill')
  })
})
