import { describe, expect, it } from 'vitest'
import { normalizeUserPath } from '../../src/core/path'

describe('normalizeUserPath cross-platform behavior', () => {
  it('normalizes Windows drive paths and slash styles without using the host platform', () => {
    expect(
      normalizeUserPath('project/src', {
        cwd: 'C:\\Users\\tester',
        platform: 'win32'
      })
    ).toBe('C:\\Users\\tester\\project\\src')

    expect(
      normalizeUserPath('\\Temp\\unixbridge', {
        cwd: 'D:\\workspace',
        platform: 'win32'
      })
    ).toBe('D:\\Temp\\unixbridge')
  })

  it('preserves UNC paths on Windows', () => {
    expect(
      normalizeUserPath('\\\\server\\share\\project', {
        cwd: 'C:\\Users\\tester',
        platform: 'win32'
      })
    ).toBe('\\\\server\\share\\project')
  })

  it('normalizes Unix paths when tested on any host platform', () => {
    expect(
      normalizeUserPath('../project/src', {
        cwd: '/Users/tester/work',
        platform: 'darwin'
      })
    ).toBe('/Users/tester/project/src')
  })
})
