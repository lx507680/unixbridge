import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  consumeOsc7,
  workingDirectoryFromOsc7,
  explainScpFailure,
  inspectUploadTree,
  remoteUploadDirectory,
  scpUploadArguments,
  uploadLocalPaths
} from '../../src/core/ssh/upload'

const target = { user: 'luoxian', host: 'example.com', port: 22 }
const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('SSH 上传', () => {
  it('只接受安全的远程目录', () => {
    expect(remoteUploadDirectory('~/')).toBe('~/')
    expect(remoteUploadDirectory('/var/www')).toBe('/var/www/')
    expect(remoteUploadDirectory('/tmp/../etc')).toBeUndefined()
    expect(remoteUploadDirectory('/tmp/;rm')).toBeUndefined()
    expect(remoteUploadDirectory('example.com:/tmp')).toBeUndefined()
  })

  it('从 OSC 7 读取远程当前目录，并跨分片拼接', () => {
    const first = consumeOsc7('', '\x1b]7;file://localhost/home/luo')
    expect(first.directories).toEqual([])
    const second = consumeOsc7(first.pending, 'xian/app\x07')
    expect(second.directories).toEqual(['/home/luoxian/app/'])
    expect(second.locations).toEqual(['/home/luoxian/app'])
    expect(second.pending).toBe('')
    expect(workingDirectoryFromOsc7('file://localhost/C:/Users/luoxian')).toBe('C:\\Users\\luoxian')
  })

  it('用参数数组调用 scp，不经过本地 shell', () => {
    expect(scpUploadArguments(target, '/Users/luoxian/notes', '/srv/app/', 'directory')).toEqual([
      '-r',
      '-P',
      '22',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=12',
      '--',
      '/Users/luoxian/notes',
      'luoxian@example.com:/srv/app/'
    ])
    expect(scpUploadArguments({ ...target, port: 2222 }, '/Users/luoxian/a.txt', '~/', 'file')).toContain('-P')
    expect(scpUploadArguments({ ...target, port: 2222 }, '/Users/luoxian/a.txt', '~/', 'file')).not.toContain('-r')
  })

  it('拒绝指向用户目录之外的符号链接', async () => {
    const home = await mkdtemp(join(tmpdir(), 'ub-upload-'))
    const outside = await mkdtemp(join(tmpdir(), 'ub-outside-'))
    homes.push(home, outside)
    const folder = join(home, 'notes')
    await mkdir(folder)
    await writeFile(join(folder, 'a.txt'), 'hi')
    expect(await inspectUploadTree(folder, home)).toEqual({ kind: 'directory', count: 1 })
    await symlink(outside, join(folder, 'escape'))
    await expect(inspectUploadTree(folder, home)).rejects.toThrow('符号链接')
  })

  it('上传到已知远程目录，并报告尚未拿到目录时的家目录', async () => {
    const home = await mkdtemp(join(tmpdir(), 'ub-upload-'))
    homes.push(home)
    const folder = join(home, 'notes')
    await mkdir(folder)
    const calls: string[][] = []
    const result = await uploadLocalPaths({
      target,
      localPaths: [folder],
      remoteDirectory: '/srv/app',
      remoteKnown: true,
      home,
      resolvePath: async (requested) => requested,
      run: async (args) => {
        calls.push(args)
      }
    })
    expect(calls[0]?.at(-1)).toBe('luoxian@example.com:/srv/app/')
    expect(result.message).toBe('已上传 notes 到 luoxian@example.com:/srv/app/')
    const fallback = await uploadLocalPaths({
      target,
      localPaths: [folder],
      remoteDirectory: '~/',
      remoteKnown: false,
      home,
      resolvePath: async (requested) => requested,
      run: async () => undefined
    })
    expect(fallback.message).toContain('已上传到家目录')
  })

  it('把认证失败说清楚', () => {
    expect(explainScpFailure('Permission denied (publickey)')).toContain('SSH 密钥')
    expect(explainScpFailure('spawn scp ENOENT')).toContain('没有可用的 scp')
  })
})
