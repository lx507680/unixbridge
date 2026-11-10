import { execFile } from 'node:child_process'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { executeStructuredCommand } from '../../src/core/commands'
import { displayWidth, renderSemanticTable } from '../../src/core/output'
import {
  canStructure,
  createDfParser,
  createLsParser,
  createNetstatParser,
  createTasklistParser,
  resolveStructured
} from '../../src/core/structured'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('dynamic structured output', () => {
  it('parses real ls -la output without splitting filenames or symlink targets', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'unixbridge-structured-'))
    temporaryDirectories.push(directory)
    await writeFile(path.join(directory, 'java_error_in_idea.hprof'), 'heap')
    await writeFile(path.join(directory, 'my report.txt'), 'report')
    await symlink('/etc/hosts', path.join(directory, 'my link.txt'))

    const { stdout: realOutput } = await execFileAsync('ls', ['-la', directory])
    const result = await executeStructuredCommand('ls', ['-la', directory], directory)
    const names = result.rows.map((row) => row.name)

    expect(realOutput).toContain('my report.txt')
    expect(realOutput).toContain('my link.txt -> /etc/hosts')
    expect(result.columns.map((column) => column.key)).toEqual([
      'mode', 'links', 'owner', 'group', 'size', 'mtime', 'name'
    ])
    expect(names).toContain('java_error_in_idea.hprof')
    expect(names).toContain('my report.txt')
    expect(names).toContain('my link.txt -> /etc/hosts')

    const rendered = renderSemanticTable(result.columns, result.rows)
    const [header = '', , firstData = ''] = rendered.text.split('\r\n')
    expect(header).toContain('\u001b[1;31m')
    expect(rendered.text).toContain('\u001b[2;37m')
    expect(displayWidth(firstData)).toBeGreaterThan(0)
    expect(rendered.text).toContain('my report.txt')
    expect(rendered.text).toContain('my link.txt -> /etc/hosts')
  })

  it('keeps macOS Chinese dates and symlink names intact', () => {
    const parser = createLsParser()
    const rows = parser.parse(
      [
        'total 16',
        'drwxr-x---+ 143 luoxian  staff  4576 11月 10 09:33 .',
        'drwxr-xr-x@   6 luoxian  staff   192  3月 31  2026 .ai_completion',
        'lrwxr-xr-x@   1 luoxian  wheel    10  9月 12 23:45 my link.txt -> /etc/hosts'
      ].join('\n')
    )
    expect(rows.map((row) => row.mtime)).toEqual(['11月 10 09:33', '3月 31  2026', '9月 12 23:45'])
    expect(rows[2]?.name).toBe('my link.txt -> /etc/hosts')
    expect(parser.columns().map((column) => column.key)).toContain('mtime')
  })

  it('derives only the name column from non-long ls output', () => {
    const parser = createLsParser()
    parser.parse('my report.txt\njava_error_in_idea.hprof\n')
    expect(parser.columns().map((column) => column.key)).toEqual(['name'])
  })

  it('derives macOS inode columns only when df output contains them', () => {
    const mac = createDfParser()
    mac.parse('/dev/disk3s1s1   460Gi    12Gi    38Gi    24%    459k  396M    0%   /')
    expect(mac.columns().map((column) => column.key)).toContain('iused')

    const linux = createDfParser()
    linux.parse('My Disk   100G   50G    40G    56%    /Volumes/My Share')
    expect(linux.columns().map((column) => column.key)).not.toContain('iused')
    expect(linux.columns().map((column) => column.key)).toContain('Mounted-on')
  })

  it('translates Windows lsof port syntax without reusing the Unix parser', () => {
    const plan = resolveStructured('lsof', ['-i:8080'], 'windows')
    expect(plan?.shellLine).toBe('netstat -ano | findstr :8080')
    expect(plan?.command).toBe('netstat')
    expect(resolveStructured('lsof', ['-i:8080'], 'mac')).toBeUndefined()

    const parser = createNetstatParser()
    const rows = parser.parse(
      '  TCP    127.0.0.1:8080    0.0.0.0:0    LISTENING    4242'
    )
    expect(rows[0]).toMatchObject({
      local: '127.0.0.1:8080',
      state: 'LISTENING',
      pid: '4242'
    })
    expect(parser.columns().map((column) => column.header)).toEqual([
      '协议', '本地地址', '外部地址', '状态', 'PID'
    ])
  })

  it('parses tasklist CSV without using the ps aux expression', () => {
    const parser = createTasklistParser()
    parser.parse('"System Idle Process","0","Services","0","8 K"')
    expect(parser.columns().map((column) => column.header)).toEqual([
      '映像名称', 'PID', '会话', '会话号', '内存'
    ])
    expect(parser.parse('"System Idle Process","0","Services","0","8 K"')[0]?.image).toBe(
      'System Idle Process'
    )
  })

  it('leaves commands without columns byte-for-byte unchanged', () => {
    const raw = 'hello world\n'
    expect(canStructure('echo', ['hello', 'world'], 'mac')).toBe(false)
    expect(canStructure('cat', ['notes.txt'], 'linux')).toBe(false)
    expect(canStructure('echo', ['hello'], 'windows')).toBe(false)
    expect(raw).toBe('hello world\n')
  })
})
