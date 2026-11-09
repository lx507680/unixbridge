import { execFile } from 'node:child_process'
import { totalmem } from 'node:os'
import { promisify } from 'node:util'
import type { ColumnDef } from './types'
import { dfColumns, lsColumns, psColumns } from './columns'
import { executeLs, renderLsText } from './ls'
import { parseDfOutput, parseLsOutput, parsePsOutput } from './output-parsers'

const execFileAsync = promisify(execFile)

export interface StructuredCommandResult {
  command: 'ls' | 'ps' | 'df'
  columns: readonly ColumnDef[]
  rows: Array<Record<string, string>>
  rawOutput: string
}

function humanSize(kibibytes: number): string {
  const units = ['K', 'M', 'G', 'T', 'P']
  let value = kibibytes
  let unit = units[0] ?? 'K'
  for (const candidate of units) {
    unit = candidate
    if (value < 1024) break
    value /= 1024
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}${unit}`
}

async function runPowerShell(script: string): Promise<string> {
  let lastError: unknown
  for (const executable of ['pwsh.exe', 'powershell.exe']) {
    try {
      const { stdout } = await execFileAsync(
        executable,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }
      )
      return stdout
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`无法读取 PowerShell 系统信息: ${String(lastError)}`)
}

async function captureLs(args: string[], cwd: string): Promise<string> {
  if (process.platform !== 'win32') {
    const { stdout } = await execFileAsync('ls', args, {
      cwd,
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024
    })
    return stdout
  }
  const execution = await executeLs(args, cwd)
  if (execution.errors.length > 0) throw new Error(execution.errors.join('\n'))
  return renderLsText(execution)
}

async function capturePs(): Promise<string> {
  if (process.platform !== 'win32') {
    const { stdout } = await execFileAsync('ps', ['aux'], {
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024
    })
    return stdout
  }
  const total = Math.max(1, totalmem())
  const script = [
    `Get-Process | ForEach-Object {`,
    `$cpu = if ($null -eq $_.CPU) { 0 } else { [math]::Round($_.CPU, 1) };`,
    `$start = try { $_.StartTime.ToString('HH:mm') } catch { '-' };`,
    `$command = if ($_.Path) { $_.Path } else { $_.ProcessName };`,
    `$mem = [math]::Round(($_.WorkingSet64 / ${total}) * 100, 1);`,
    `'{0} {1} {2} {3} {4} {5} ?? S {6} 0:00.00 {7}' -f $env:USERNAME,$_.Id,$cpu,$mem,`,
    '[math]::Round($_.VirtualMemorySize64/1KB),[math]::Round($_.WorkingSet64/1KB),$start,$command',
    `}`
  ].join(' ')
  return runPowerShell(script)
}

async function captureDf(args: string[]): Promise<string> {
  if (process.platform !== 'win32') {
    const commandArgs = args.some((arg) => arg.includes('h')) ? ['-h'] : ['-k']
    const { stdout } = await execFileAsync('df', commandArgs, {
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024
    })
    return stdout
  }
  const humanReadable = args.some((arg) => arg.includes('h'))
  const script = [
    `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {`,
    `$used = $_.Size - $_.FreeSpace;`,
    `$percent = if ($_.Size) { [math]::Round(($used / $_.Size) * 100) } else { 0 };`,
    `$format = {`,
    `param($bytes)`,
    humanReadable
      ? `if ($bytes -ge 1GB) { '{0:N1}G' -f ($bytes/1GB) } elseif ($bytes -ge 1MB) { '{0:N1}M' -f ($bytes/1MB) } else { '{0:N1}K' -f ($bytes/1KB) }`
      : `[math]::Round($bytes/1KB)`,
    `};`,
    `'{0} {1} {2} {3} {4}% {5}' -f $_.DeviceID,(& $format $_.Size),(& $format $used),(& $format $_.FreeSpace),$percent,$_.DeviceID`,
    `}`
  ].join(' ')
  return runPowerShell(script)
}

export async function executeStructuredCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<StructuredCommandResult> {
  if (command === 'ls') {
    const rawOutput = await captureLs(args, cwd)
    return { command, columns: lsColumns, rows: parseLsOutput(rawOutput), rawOutput }
  }
  if (command === 'ps') {
    const rawOutput = await capturePs()
    return { command, columns: psColumns, rows: parsePsOutput(rawOutput), rawOutput }
  }
  if (command === 'df') {
    const rawOutput = await captureDf(args)
    return { command, columns: dfColumns, rows: parseDfOutput(rawOutput), rawOutput }
  }
  throw new Error(`不支持结构化命令: ${command}`)
}
