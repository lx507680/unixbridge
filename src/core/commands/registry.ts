import type { CommandDefinition, CommandRegistry, CommandSchema } from './types'
import { lsCommand } from './ls'

const BUILTIN_METADATA: Array<[string, string, string]> = [
  ['pwd', '显示当前目录', 'pwd'],
  ['cd', '切换当前目录', 'cd [path]'],
  ['cat', '输出文件内容', 'cat <file...>'],
  ['echo', '输出文本', 'echo [text...]'],
  ['clear', '清空终端', 'clear'],
  ['history', '显示会话历史', 'history'],
  ['mkdir', '创建目录', 'mkdir [-p] <path...>'],
  ['which', '查找命令', 'which <command...>'],
  ['env', '显示环境变量', 'env'],
  ['export', '设置会话环境变量', 'export NAME=value'],
  ['cp', '复制文件或目录', 'cp [-r] <source> <target>'],
  ['mv', '移动文件或目录', 'mv <source> <target>'],
  ['rm', '删除文件或目录', 'rm [-r] [-f] <path...>'],
  ['touch', '创建文件或更新时间', 'touch <file...>'],
  ['head', '输出文件开头', 'head [-n count] <file>'],
  ['tail', '输出文件结尾', 'tail [-n count] <file>'],
  ['grep', '筛选文本或结构化行', 'grep [-ivnr] <pattern> [path...]'],
  ['find', '按条件查找文件', 'find [path] [-name pattern]'],
  ['ps', '显示进程', 'ps'],
  ['kill', '终止进程', 'kill [-9] <pid...>'],
  ['man', '显示命令帮助', 'man <command>'],
  ['help', '显示帮助', 'help [command]']
]

const BUILTIN_SCHEMAS: CommandSchema[] = BUILTIN_METADATA.map(([name, summary, usage]) => ({
  name,
  summary,
  usage,
  builtin: true,
  risk: name === 'rm' || name === 'kill' ? 'high' : 'low'
}))

export class InMemoryCommandRegistry implements CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>()

  register(definition: CommandDefinition): void {
    const names = [definition.schema.name, ...(definition.schema.aliases ?? [])]
    for (const name of names) {
      const key = name.toLowerCase()
      if (this.commands.has(key)) throw new Error(`命令已注册: ${name}`)
      this.commands.set(key, definition)
    }
  }

  resolve(name: string): CommandDefinition | undefined {
    return this.commands.get(name.toLowerCase())
  }

  list(): readonly CommandDefinition[] {
    return [...new Set(this.commands.values())].sort((a, b) =>
      a.schema.name.localeCompare(b.schema.name)
    )
  }
}

export function createDefaultRegistry(
  overrides: readonly CommandDefinition[] = []
): InMemoryCommandRegistry {
  const registry = new InMemoryCommandRegistry()
  const definitions = [lsCommand, ...overrides]
  const overrideNames = new Set(definitions.map((item) => item.schema.name))
  for (const schema of BUILTIN_SCHEMAS) {
    if (!overrideNames.has(schema.name)) registry.register({ schema })
  }
  for (const definition of definitions) registry.register(definition)
  return registry
}
