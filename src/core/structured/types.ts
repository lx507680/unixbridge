import type { ColumnDef } from '../commands/types'

export type StructuredPlatform = 'mac' | 'linux' | 'windows'

export interface CommandParser {
  match(command: string, platform: StructuredPlatform, args: readonly string[]): boolean
  parse(raw: string): Array<Record<string, string>>
  columns(): ColumnDef[]
}

export function currentPlatform(): StructuredPlatform {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'mac'
  return 'linux'
}

export function outputLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
}

export function columnsFor(
  rows: readonly Record<string, string>[],
  order: readonly string[],
  catalog: Readonly<Record<string, ColumnDef>>
): ColumnDef[] {
  return order.flatMap((key) => {
    const column = catalog[key]
    return column && rows.some((row) => Object.prototype.hasOwnProperty.call(row, key))
      ? [column]
      : []
  })
}
