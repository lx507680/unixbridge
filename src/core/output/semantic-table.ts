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

export interface OutputColumnLayout {
  key: string
  header: string
  description: string
  align: 'start' | 'end'
  start: number
  width: number
  contentWidth: number
  trailing: number
}

export interface HeaderSegment {
  key: string
  header: string
  start: number
}

export interface SemanticTableRender {
  headerText: string
  headerSegments: HeaderSegment[]
  legendText: string
  text: string
  details: string
  layout: OutputColumnLayout[]
}

function columnAlign(column: ColumnDef): 'start' | 'end' {
  return column.type === 'numeric' || column.type === 'date' ? 'end' : 'start'
}

function clipToWidth(value: string, width: number): string {
  if (width <= 0) return ''
  if (displayWidth(value) <= width) return value
  const ellipsis = '…'
  const ellipsisWidth = displayWidth(ellipsis)
  const limit = width > ellipsisWidth ? width - ellipsisWidth : width
  let used = 0
  let output = ''
  for (const character of value) {
    const characterWidth = displayWidth(character)
    if (used + characterWidth > limit) break
    output += character
    used += characterWidth
  }
  return width > ellipsisWidth ? `${output}${ellipsis}` : output
}

function fitCell(value: string, width: number, align: 'start' | 'end'): string {
  const clipped = clipToWidth(value, width)
  const gap = ' '.repeat(Math.max(0, width - displayWidth(clipped)))
  return align === 'end' ? `${gap}${clipped}` : `${clipped}${gap}`
}

function locateCells(
  line: string,
  cells: readonly string[]
): Array<{ start: number; end: number }> | undefined {
  let cursor = 0
  const spans: Array<{ start: number; end: number }> = []
  for (const cell of cells) {
    const index = line.indexOf(cell, cursor)
    if (index < 0) return undefined
    const start = displayWidth(line.slice(0, index))
    spans.push({ start, end: start + displayWidth(cell) })
    cursor = index + cell.length
  }
  return spans
}

function measureOutputColumns(
  columns: readonly ColumnDef[],
  rows: readonly SemanticRow[],
  rawOutput: string
): OutputColumnLayout[] | undefined {
  const lines = rawOutput.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 0)
  const starts = columns.map(() => [] as number[])
  const ends = columns.map(() => [] as number[])
  let lineCursor = 0
  let matched = 0
  for (const row of rows) {
    const cells = columns.map((column) => String(row[column.key] ?? ''))
    if (cells.some((cell) => cell.length === 0)) continue
    while (lineCursor < lines.length) {
      const line = lines[lineCursor] ?? ''
      lineCursor += 1
      const spans = locateCells(line, cells)
      if (!spans) continue
      spans.forEach((span, index) => {
        starts[index]?.push(span.start)
        ends[index]?.push(span.end)
      })
      matched += 1
      break
    }
  }
  if (matched === 0) return undefined

  return columns.map((column, index) => {
    const columnStarts = starts[index] ?? []
    const columnEnds = ends[index] ?? []
    const start = Math.min(...columnStarts)
    const end = Math.max(...columnEnds)
    const nextStarts = starts[index + 1]
    const nextStart = nextStarts && nextStarts.length > 0 ? Math.min(...nextStarts) : undefined
    const slot = nextStart === undefined
      ? Math.max(end - start, displayWidth(column.header), 1)
      : Math.max(1, nextStart - start)
    const contentWidth = Math.min(slot, Math.max(1, end - start))
    return {
      key: column.key,
      header: column.header,
      description: column.description,
      align: columnAlign(column),
      start,
      width: slot,
      contentWidth,
      trailing: slot - contentWidth
    }
  })
}

function fallbackLayout(
  columns: readonly ColumnDef[],
  rows: readonly SemanticRow[]
): OutputColumnLayout[] {
  const values = rows.map((row) => columns.map((column) => String(row[column.key] ?? '')))
  let start = 0
  return columns.map((column, index) => {
    const contentWidth = Math.max(
      displayWidth(column.header),
      ...values.map((row) => displayWidth(row[index] ?? ''))
    )
    const trailing = index === columns.length - 1 ? 0 : 1
    const layout: OutputColumnLayout = {
      key: column.key,
      header: column.header,
      description: column.description,
      align: columnAlign(column),
      start,
      width: contentWidth + trailing,
      contentWidth,
      trailing
    }
    start += layout.width
    return layout
  })
}

export function outputIncludesHeader(rawOutput: string, columns: readonly ColumnDef[]): boolean {
  const first = rawOutput.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ''
  if (!first || columns.length === 0) return false
  const hits = columns.filter((column) => first.includes(column.header)).length
  return hits >= Math.min(2, columns.length)
}

export function layoutColumns(
  columns: readonly ColumnDef[],
  rows: readonly SemanticRow[],
  rawOutput = ''
): OutputColumnLayout[] {
  return measureOutputColumns(columns, rows, rawOutput) ?? fallbackLayout(columns, rows)
}

function renderAlignedLine(layout: readonly OutputColumnLayout[]): string {
  let line = ''
  let cursor = 0
  for (const column of layout) {
    const gap = column.start - cursor
    if (gap > 0) line += ' '.repeat(gap)
    const fitted = fitCell(column.description, column.contentWidth, 'start')
    const spacer = ' '.repeat(column.trailing)
    line += `${fitted}${spacer}`
    cursor = column.start + displayWidth(fitted) + column.trailing
  }
  return line.trimEnd()
}

function renderHeaderLine(layout: readonly OutputColumnLayout[]): { text: string; segments: HeaderSegment[] } {
  const placed: Array<{ column: OutputColumnLayout; start: number }> = []
  let cursor = 0
  for (const [index, column] of layout.entries()) {
    const width = displayWidth(column.header)
    const nextStart = layout[index + 1]?.start
    let start = Math.max(column.start, cursor)
    if (nextStart !== undefined && width > 0 && start + width >= nextStart) {
      const shifted = nextStart - width - 1
      if (shifted >= cursor) start = shifted
    }
    if (start < cursor) start = cursor
    placed.push({ column, start })
    cursor = start + width
  }

  let text = ''
  let used = 0
  const segments: HeaderSegment[] = []
  for (const item of placed) {
    if (item.start > used) text += ' '.repeat(item.start - used)
    text += item.column.header
    used = item.start + displayWidth(item.column.header)
    segments.push({ key: item.column.key, header: item.column.header, start: item.start })
  }
  return { text: text.trimEnd(), segments }
}

function renderDataLine(layout: readonly OutputColumnLayout[], cells: readonly string[]): string {
  let line = ''
  let cursor = 0
  for (const [index, column] of layout.entries()) {
    const gap = column.start - cursor
    if (gap > 0) line += ' '.repeat(gap)
    const fitted = fitCell(cells[index] ?? '', column.contentWidth, column.align)
    line += `${fitted}${' '.repeat(column.trailing)}`
    cursor = column.start + displayWidth(fitted) + column.trailing
  }
  return line.trimEnd()
}

export function renderSemanticTable(
  columns: readonly ColumnDef[],
  rows: readonly SemanticRow[],
  expanded = false,
  rawOutput = ''
): SemanticTableRender {
  const layout = layoutColumns(columns, rows, rawOutput)
  const header = renderHeaderLine(layout)
  const headerText = header.text
  const legendText = renderAlignedLine(layout)
  const data = rows.map((row) =>
    renderDataLine(layout, columns.map((column) => String(row[column.key] ?? '')))
  )
  const details = renderSemanticDetails(columns)
  return {
    headerText,
    headerSegments: header.segments,
    legendText,
    layout,
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
