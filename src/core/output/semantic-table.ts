import stringWidth from 'string-width'
import type { ColumnDef } from '../commands'

export type SemanticCell = string | number | boolean | null | undefined
export type SemanticRow = Record<string, SemanticCell>

const ANSI_RESET = '\u001b[0m'
const ANSI_HEADER = '\u001b[1;31m'
const ANSI_DIM = '\u001b[2;37m'
const ANSI_DETAIL = '\u001b[2;36m'

export function displayWidth(value: string): number {
  return stringWidth(value)
}

function padCell(value: string, width: number): string {
  return `${value}${' '.repeat(Math.max(0, width - displayWidth(value)))}`
}

export interface SemanticTableRender {
  headerText: string
  legendText: string
  text: string
  details: string
}

export function renderSemanticTable(
  columns: readonly ColumnDef[],
  rows: readonly SemanticRow[],
  expanded = false
): SemanticTableRender {
  const values = rows.map((row) =>
    columns.map((column) => String(row[column.key] ?? ''))
  )
  const widths = columns.map((column, columnIndex) =>
    Math.max(
      displayWidth(column.header),
      ...values.map((row) => displayWidth(row[columnIndex] ?? ''))
    )
  )
  const line = (cells: readonly string[]): string =>
    cells.map((cell, index) => padCell(cell, (widths[index] ?? 0) + 2)).join('').trimEnd()
  const headerText = line(columns.map((column) => column.header))
  const legendText = columns.map((column) => `${column.key}: ${column.description}`).join(' · ')
  const data = values.map(line)
  const details = renderSemanticDetails(columns)
  return {
    headerText,
    legendText,
    text: [
      `${ANSI_HEADER}${headerText}${ANSI_RESET}`,
      `${ANSI_DIM}${legendText}${ANSI_RESET}`,
      ...data,
      ...(expanded ? [details] : [])
    ].join('\r\n'),
    details
  }
}

export function renderSemanticDetails(columns: readonly ColumnDef[]): string {
  return columns
    .map(
      (column) =>
        `${ANSI_DETAIL}${column.header} (${column.key})${ANSI_RESET} ${column.detailed ?? column.description}`
    )
    .join('\r\n')
}
