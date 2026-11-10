import { describe, expect, it } from 'vitest'
import { previewKind, previewUrl } from '../../src/core/preview/kind'
import { parseSshTarget, sshLaunchArguments, sshSessionName } from '../../src/core/ssh/target'

describe('文件预览', () => {
  it('按扩展名选择预览类型', () => {
    expect(previewKind('笔记.md')).toBe('markdown')
    expect(previewKind('报表.csv')).toBe('csv')
    expect(previewKind('封面.png')).toBe('image')
    expect(previewKind('演示.mp4')).toBe('video')
    expect(previewKind('说明.pdf')).toBe('pdf')
    expect(previewKind('归档.zip')).toBe('none')
  })

  it('只把路径放在预览地址的查询参数里', () => {
    const url = new URL(previewUrl('/Users/luoxian/说明.pdf'))
    expect(url.protocol).toBe('unixbridge:')
    expect(url.hostname).toBe('preview')
    expect(url.searchParams.get('path')).toBe('/Users/luoxian/说明.pdf')
  })
})

describe('持久 SSH', () => {
  it('解析 user@host:port', () => {
    expect(parseSshTarget('luoxian@example.com:2222')).toEqual({
      user: 'luoxian',
      host: 'example.com',
      port: 2222
    })
    expect(parseSshTarget('example.com')).toEqual({ user: '', host: 'example.com', port: 22 })
    expect(parseSshTarget('host;rm -rf')).toBeUndefined()
  })

  it('用固定远端命令接入 tmux，不拼接用户命令', () => {
    const args = sshLaunchArguments(
      { user: 'luoxian', host: 'example.com', port: 22 },
      '123e4567-e89b-12d3-a456-426614174000'
    )
    expect(args).toContain('luoxian@example.com')
    const remote = args.at(-1) ?? ''
    expect(remote).toContain(`tmux new-session -A -s ${sshSessionName('123e4567-e89b-12d3-a456-426614174000')}`)
    expect(remote).toContain('\\e]133;A')
    expect(remote).not.toContain('example.com')
    expect(remote).not.toContain('luoxian')
  })
})
