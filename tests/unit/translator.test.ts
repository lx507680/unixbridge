import { describe, expect, it } from 'vitest'
import { commandTranslator } from '../../src/core/translator'

describe('command translator', () => {
  it('maps ls, grep and find to PowerShell from the local catalog', () => {
    const ls = commandTranslator.translate('ls -la', 'windows')
    expect(ls?.translated).toBe('Get-ChildItem -Force | Format-List')
    expect(ls?.notice).toBe('[系统翻译]: 正在执行等效命令: Get-ChildItem -Force | Format-List')
    expect(ls?.shellLine.startsWith('Write-Output ')).toBe(true)
    expect(ls?.changed).toBe(true)

    expect(commandTranslator.translate('grep -n foo src', 'win32')?.translated).toBe(
      "Select-String -Pattern 'foo' -CaseSensitive -Path 'src'"
    )
    expect(commandTranslator.translate('find . -name "*.ts" -type f', 'windows')?.translated).toBe(
      "Get-ChildItem -LiteralPath '.' -Recurse -File -Filter '*.ts'"
    )
  })

  it('leaves macOS and Linux commands unchanged', () => {
    const result = commandTranslator.translate('ls -la', 'macos')
    expect(result?.changed).toBe(false)
    expect(result?.translated).toBe('ls -la')
    expect(result?.shellLine).toBe('ls -la')
  })

  it('reads descriptions synchronously from the bundled catalog', () => {
    expect(commandTranslator.getDescription('ls', 'macos')).toContain('类型与权限')
    expect(commandTranslator.getDescription('grep', 'linux')).toContain('行号')
    expect(commandTranslator.getDescription('find', 'windows')).toContain('路径')
    expect(commandTranslator.getDescription('rm', 'windows')).toBe('')
  })

  it('refuses pipelines, substitutions and unknown flags', () => {
    expect(commandTranslator.translate('ls -la && whoami', 'windows')).toBeUndefined()
    expect(commandTranslator.translate('ls $(whoami)', 'windows')).toBeUndefined()
    expect(commandTranslator.translate('grep -P foo', 'windows')).toBeUndefined()
    expect(commandTranslator.translate('find . -delete', 'windows')).toBeUndefined()
    expect(commandTranslator.translate('ls -la\nwhoami', 'windows')).toBeUndefined()
  })
})
