export type RedirectOperator = '>' | '>>' | '2>' | '2>&1'

export interface SourceSpan {
  start: number
  end: number
}

export interface CommandNode {
  kind: 'command'
  name: string
  args: string[]
  flags: Record<string, string | boolean>
  argv: string[]
  span: SourceSpan
}

export interface PipelineNode {
  kind: 'pipeline'
  commands: AstNode[]
  span: SourceSpan
}

export interface RedirectSpec {
  operator: RedirectOperator
  target?: string
}

export interface RedirectNode {
  kind: 'redirect'
  command: AstNode
  redirects: RedirectSpec[]
  span: SourceSpan
}

export interface LogicalNode {
  kind: 'and' | 'or'
  left: AstNode
  right: AstNode
  span: SourceSpan
}

export interface SequenceNode {
  kind: 'sequence'
  commands: AstNode[]
  span: SourceSpan
}

export type AstNode = CommandNode | PipelineNode | RedirectNode | LogicalNode | SequenceNode

export interface ParseDiagnostic {
  code: 'EMPTY_INPUT' | 'UNEXPECTED_TOKEN' | 'UNCLOSED_QUOTE' | 'UNSUPPORTED_SYNTAX'
  message: string
  span: SourceSpan
  suggestion?: string
}

export type ParseResult =
  | { ok: true; ast: AstNode; diagnostics: [] }
  | { ok: false; ast?: AstNode; diagnostics: ParseDiagnostic[] }

export interface CommandParser {
  parse(input: string): ParseResult
}
