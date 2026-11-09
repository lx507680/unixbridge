import type {
  AstNode,
  CommandNode,
  CommandParser,
  LogicalNode,
  ParseDiagnostic,
  ParseResult,
  RedirectOperator,
  RedirectSpec,
  SourceSpan
} from './types'

export * from './types'

type Operator = '&&' | '||' | '|' | '>' | '>>' | '2>' | '2>&1' | ';'
type Token =
  | { type: 'word'; value: string; span: SourceSpan }
  | { type: 'operator'; value: Operator; span: SourceSpan }

const OPERATORS = ['2>&1', '&&', '||', '>>', '2>', '|', '>', ';'] as const
const UNSUPPORTED = [
  { expression: /\$\(/, label: '命令替换 $(...)' },
  { expression: /[<>]\(/, label: 'process substitution' },
  { expression: /(^|\s)<<\s*/, label: 'here-doc' }
]

function diagnostic(
  code: ParseDiagnostic['code'],
  message: string,
  start: number,
  end: number,
  suggestion?: string
): ParseDiagnostic {
  const value: ParseDiagnostic = { code, message, span: { start, end } }
  if (suggestion !== undefined) value.suggestion = suggestion
  return value
}

function tokenize(input: string): { tokens: Token[]; diagnostics: ParseDiagnostic[] } {
  const tokens: Token[] = []
  const diagnostics: ParseDiagnostic[] = []
  let index = 0

  while (index < input.length) {
    if (/\s/.test(input[index] ?? '')) {
      index += 1
      continue
    }

    const operator = OPERATORS.find((candidate) => input.startsWith(candidate, index))
    if (operator) {
      tokens.push({
        type: 'operator',
        value: operator,
        span: { start: index, end: index + operator.length }
      })
      index += operator.length
      continue
    }

    const start = index
    let value = ''
    let quote: "'" | '"' | undefined
    while (index < input.length) {
      const char = input[index] ?? ''
      if (quote) {
        if (char === quote) {
          quote = undefined
          index += 1
        } else if (
          char === '\\' &&
          quote === '"' &&
          input[index + 1] === '"'
        ) {
          value += '"'
          index += 2
        } else {
          value += char
          index += 1
        }
        continue
      }
      if (char === "'" || char === '"') {
        quote = char
        index += 1
        continue
      }
      if (char === '\\' && index + 1 < input.length) {
        const next = input[index + 1] ?? ''
        if (/[\s"'\\|>&;]/.test(next)) {
          value += next
          index += 2
          continue
        }
        // Keep Windows path separators such as C:\Windows intact.
        value += char
        index += 1
        continue
      }
      if (/\s/.test(char) || OPERATORS.some((candidate) => input.startsWith(candidate, index))) {
        break
      }
      value += char
      index += 1
    }

    if (quote) {
      diagnostics.push(
        diagnostic('UNCLOSED_QUOTE', `缺少结束引号 ${quote}`, start, input.length)
      )
      break
    }
    tokens.push({ type: 'word', value, span: { start, end: index } })
  }

  return { tokens, diagnostics }
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {}
  for (const arg of args) {
    if (arg === '--') break
    if (arg.startsWith('--') && arg.length > 2) {
      const [name = '', value] = arg.slice(2).split('=', 2)
      flags[name] = value ?? true
    } else if (/^-[^-]/.test(arg)) {
      for (const name of arg.slice(1)) flags[name] = true
    }
  }
  return flags
}

class UnixbridgeParser implements CommandParser {
  private tokens: Token[] = []
  private cursor = 0
  private diagnostics: ParseDiagnostic[] = []

  parse(input: string): ParseResult {
    for (const unsupported of UNSUPPORTED) {
      const match = unsupported.expression.exec(input)
      if (match?.index !== undefined) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              'UNSUPPORTED_SYNTAX',
              `暂不支持 ${unsupported.label}`,
              match.index,
              match.index + match[0].length,
              '请拆成多个明确命令，或在 WSL/Git Bash 中执行。'
            )
          ]
        }
      }
    }

    const tokenized = tokenize(input)
    if (tokenized.diagnostics.length > 0) {
      return { ok: false, diagnostics: tokenized.diagnostics }
    }
    if (tokenized.tokens.length === 0) {
      return {
        ok: false,
        diagnostics: [diagnostic('EMPTY_INPUT', '请输入命令', 0, input.length)]
      }
    }

    this.tokens = tokenized.tokens
    this.cursor = 0
    this.diagnostics = []
    const ast = this.parseSequence()
    const trailing = this.peek()
    if (trailing) {
      this.diagnostics.push(
        diagnostic(
          'UNEXPECTED_TOKEN',
          `无法解析 ${trailing.value}`,
          trailing.span.start,
          trailing.span.end
        )
      )
    }
    return this.diagnostics.length === 0 && ast
      ? { ok: true, ast, diagnostics: [] }
      : { ok: false, ...(ast ? { ast } : {}), diagnostics: this.diagnostics }
  }

  private parseSequence(): AstNode | undefined {
    const commands: AstNode[] = []
    const first = this.parseLogical()
    if (!first) return undefined
    commands.push(first)
    while (this.matchOperator(';')) {
      if (!this.peek()) break
      const next = this.parseLogical()
      if (!next) break
      commands.push(next)
    }
    if (commands.length === 1) return commands[0]
    return {
      kind: 'sequence',
      commands,
      span: { start: commands[0]?.span.start ?? 0, end: commands.at(-1)?.span.end ?? 0 }
    }
  }

  private parseLogical(): AstNode | undefined {
    let node = this.parsePipeline()
    while (node && this.isOperator('&&', '||')) {
      const operator = this.consume() as Extract<Token, { type: 'operator' }>
      const right = this.parsePipeline()
      if (!right) {
        this.expectedCommand(operator.span.end)
        break
      }
      const logical: LogicalNode = {
        kind: operator.value === '&&' ? 'and' : 'or',
        left: node,
        right,
        span: { start: node.span.start, end: right.span.end }
      }
      node = logical
    }
    return node
  }

  private parsePipeline(): AstNode | undefined {
    const commands: AstNode[] = []
    const first = this.parseRedirectedCommand()
    if (!first) return undefined
    commands.push(first)
    while (this.matchOperator('|')) {
      const next = this.parseRedirectedCommand()
      if (!next) {
        this.expectedCommand(this.peek(-1)?.span.end ?? first.span.end)
        break
      }
      commands.push(next)
    }
    if (commands.length === 1) return commands[0]
    return {
      kind: 'pipeline',
      commands,
      span: { start: commands[0]?.span.start ?? 0, end: commands.at(-1)?.span.end ?? 0 }
    }
  }

  private parseRedirectedCommand(): AstNode | undefined {
    const command = this.parseCommand()
    if (!command) return undefined
    const redirects: RedirectSpec[] = []
    let end = command.span.end
    while (this.isOperator('>', '>>', '2>', '2>&1')) {
      const operator = this.consume() as Extract<Token, { type: 'operator' }>
      if (operator.value === '2>&1') {
        redirects.push({ operator: operator.value })
        end = operator.span.end
        continue
      }
      const target = this.consumeWord()
      if (!target) {
        this.diagnostics.push(
          diagnostic(
            'UNEXPECTED_TOKEN',
            `重定向 ${operator.value} 后需要路径`,
            operator.span.start,
            operator.span.end
          )
        )
        break
      }
      redirects.push({ operator: operator.value as RedirectOperator, target: target.value })
      end = target.span.end
    }
    return redirects.length === 0
      ? command
      : {
          kind: 'redirect',
          command,
          redirects,
          span: { start: command.span.start, end }
        }
  }

  private parseCommand(): CommandNode | undefined {
    const words: Extract<Token, { type: 'word' }>[] = []
    while (this.peek()?.type === 'word') words.push(this.consume() as (typeof words)[number])
    const first = words[0]
    if (!first) return undefined
    const argv = words.map((word) => word.value)
    const args = argv.slice(1)
    return {
      kind: 'command',
      name: first.value,
      args,
      flags: parseFlags(args),
      argv,
      span: { start: first.span.start, end: words.at(-1)?.span.end ?? first.span.end }
    }
  }

  private isOperator(...values: Operator[]): boolean {
    const token = this.peek()
    return token?.type === 'operator' && values.includes(token.value)
  }

  private matchOperator(value: Operator): boolean {
    if (!this.isOperator(value)) return false
    this.cursor += 1
    return true
  }

  private consumeWord(): Extract<Token, { type: 'word' }> | undefined {
    const token = this.peek()
    if (token?.type !== 'word') return undefined
    this.cursor += 1
    return token
  }

  private consume(): Token | undefined {
    const token = this.peek()
    this.cursor += 1
    return token
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.cursor + offset]
  }

  private expectedCommand(position: number): void {
    this.diagnostics.push(
      diagnostic('UNEXPECTED_TOKEN', '操作符后需要命令', position, position)
    )
  }
}

export const parser: CommandParser = new UnixbridgeParser()
export function parseCommandLine(input: string): ParseResult {
  return parser.parse(input)
}
