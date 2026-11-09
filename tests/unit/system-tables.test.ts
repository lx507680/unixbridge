import { describe, expect, it } from 'vitest'
import { executeStructuredCommand } from '../../src/core/commands'

describe('structured system commands', () => {
  it('returns ps rows using the shared semantic schema', async () => {
    const result = await executeStructuredCommand('ps', ['aux'], process.cwd())
    expect(result.columns.map((column) => column.key)).toContain('PID')
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows[0]).toHaveProperty('COMMAND')
  })

  it('returns df rows using the shared semantic schema', async () => {
    const result = await executeStructuredCommand('df', ['-h'], process.cwd())
    expect(result.columns.map((column) => column.key)).toContain('Mounted-on')
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows[0]).toHaveProperty('Use%')
  })
})
