import type { StructuredOutput } from '../output'
import type { ShellState } from '../shellstate'

export interface CommandFlagSchema {
  short?: string
  long?: string
  description: string
  takesValue?: boolean
}

export interface ColumnDef {
  key: string
  header: string
  description: string
  detailed?: string
  type?: 'default' | 'numeric' | 'percentage' | 'date'
}

export interface CommandSchema {
  name: string
  aliases?: readonly string[]
  summary: string
  usage: string
  flags?: readonly CommandFlagSchema[]
  columns?: readonly ColumnDef[]
  builtin: boolean
  risk: 'low' | 'medium' | 'high'
}

export interface CommandInvocation {
  name: string
  args: string[]
  rawInput: string
  sourceBlockId?: string
}

export interface CommandContext {
  shell: ShellState
  signal: AbortSignal
  stdin?: StructuredOutput[]
}

export interface CommandResult {
  exitCode: number
  stdout: StructuredOutput[]
  stderr: StructuredOutput[]
  rawText: string
  metadata?: Record<string, unknown>
}

export interface CommandDefinition {
  schema: CommandSchema
  execute?: (invocation: CommandInvocation, context: CommandContext) => Promise<CommandResult>
  parseOutput?: (raw: string) => Array<Record<string, string>>
}

export interface CommandRegistry {
  register(definition: CommandDefinition): void
  resolve(name: string): CommandDefinition | undefined
  list(): readonly CommandDefinition[]
}
