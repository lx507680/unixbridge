import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { executeLs, renderLsText } from '../../src/core/commands/ls'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'unixbridge-ls-'))
  temporaryDirectories.push(directory)
  await writeFile(path.join(directory, 'a.txt'), 'hello\n')
  await writeFile(path.join(directory, '.hidden'), 'secret\n')
  await mkdir(path.join(directory, 'folder'))
  return directory
}

describe('ls builtin', () => {
  it('returns Unix-like rows, hidden files and directory markers for -la', async () => {
    const cwd = await fixture()
    const result = await executeLs(['-la'], cwd)
    const names = result.rows.map((row) => row.name)

    expect(names).toContain('./')
    expect(names).toContain('../')
    expect(names).toContain('.hidden')
    expect(names).toContain('a.txt')
    expect(names).toContain('folder/')
    expect(result.rows.every((row) => row.mode.length === 10)).toBe(true)
    expect(result.errors).toEqual([])

    const text = renderLsText(result)
    expect(text).toMatch(/^total \d+/)
    expect(text).toContain('a.txt')
  })

  it('keeps structured size as bytes while rendering -h', async () => {
    const cwd = await fixture()
    const result = await executeLs(['-lah'], cwd)
    const file = result.rows.find((row) => row.name === 'a.txt')
    expect(file?.size).toBe(6)
    expect(file?.displaySize).toBe('6')
  })
})
