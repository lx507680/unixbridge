import { describe, expect, it } from 'vitest'
import { classifyFile, fileDisplayName, resolveListedPath } from '../../src/renderer/file-icons'

describe('文件类型图标', () => {
  it('按目录、链接和扩展名区分类型', () => {
    expect(classifyFile('src', 'drwxr-xr-x')).toBe('directory')
    expect(classifyFile('报告.pdf', '-rw-r--r--')).toBe('pdf')
    expect(classifyFile('README.md')).toBe('markdown')
    expect(classifyFile('components.json')).toBe('data')
    expect(classifyFile('next.config.ts')).toBe('code')
    expect(classifyFile('cover.png')).toBe('image')
    expect(classifyFile('backup.tar.gz')).toBe('archive')
    expect(classifyFile('my.cnf -> /etc/alternatives/my.cnf', 'lrwxr-xr-x')).toBe('symlink')
    expect(classifyFile('notes.txt')).toBe('document')
    expect(classifyFile('.android')).toBe('file')
  })

  it('链接只取箭头前的名称', () => {
    expect(fileDisplayName('my.cnf -> /etc/alternatives/my.cnf')).toBe('my.cnf')
  })

  it('从当前目录解析可点击路径', () => {
    expect(resolveListedPath('/Users/luoxian', 'src')).toBe('/Users/luoxian/src')
    expect(resolveListedPath('/Users/luoxian', '..')).toBe('/Users')
    expect(resolveListedPath('/Users/luoxian', 'my.cnf -> /etc/alternatives/my.cnf')).toBe('/Users/luoxian/my.cnf')
    expect(resolveListedPath('/', '..')).toBe('/')
  })
})
