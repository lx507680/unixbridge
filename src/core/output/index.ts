import type { AstNode } from '../parser'

export * from './semantic-table'

export type BlockStatus = 'running' | 'success' | 'error' | 'cancelled' | 'denied'

export interface StructuredTable<Row extends object = object> {
  kind: 'table'
  columns: readonly string[]
  rows: Row[]
  sourceBlockId?: string
}

export interface TextOutput {
  kind: 'text'
  lines: string[]
  sourceBlockId?: string
}

export type StructuredOutput = StructuredTable | TextOutput

export interface OutputBlock {
  id: string
  input: string
  ast: AstNode
  status: BlockStatus
  startedAt: string
  endedAt?: string
  exitCode?: number
  stdout: StructuredOutput[]
  stderr: StructuredOutput[]
  rawAnsi: string
  suggestedFix?: string
}
