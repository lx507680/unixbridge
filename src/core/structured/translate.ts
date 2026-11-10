import { createDfParser } from './parsers/df'
import { createLsParser } from './parsers/ls'
import { createNetstatParser } from './parsers/netstat'
import { createPsParser } from './parsers/ps'
import { createTasklistParser } from './parsers/tasklist'
import type { CommandParser, StructuredPlatform } from './types'

export type SemanticId = 'list-files' | 'process-list' | 'disk-usage' | 'port-listeners'

export const semanticEquivalents: Record<SemanticId, Record<StructuredPlatform, string>> = {
  'list-files': { mac: 'ls', linux: 'ls', windows: 'ls' },
  'process-list': { mac: 'ps aux', linux: 'ps aux', windows: 'tasklist /FO CSV /NH' },
  'disk-usage': { mac: 'df -h', linux: 'df -h', windows: 'Get-CimInstance Win32_LogicalDisk' },
  'port-listeners': {
    mac: 'lsof -nP -iTCP:{port} -sTCP:LISTEN',
    linux: 'ss -ltnp',
    windows: 'netstat -ano | findstr :{port}'
  }
}

export interface StructuredPlan {
  semantic: SemanticId
  command: string
  args: string[]
  shellLine?: string
  createParser: () => CommandParser
}

function commandPort(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    const direct = /(?:-i:?(?:TCP:)?:?|TCP:)(?<port>\d{1,5})$/.exec(arg)
    if (direct?.groups?.port) return direct.groups.port
    if (arg === '-i') {
      const next = /^(?:TCP:)?:?(?<port>\d{1,5})$/.exec(args[index + 1] ?? '')
      if (next?.groups?.port) return next.groups.port
    }
  }
  return undefined
}

export function resolveStructured(
  command: string,
  args: readonly string[],
  platform: StructuredPlatform
): StructuredPlan | undefined {
  const name = command.toLowerCase()
  if (name === 'ls') {
    return { semantic: 'list-files', command: 'ls', args: [...args], createParser: createLsParser }
  }
  if (name === 'ps' && platform !== 'windows') {
    return {
      semantic: 'process-list',
      command: 'ps',
      args: [...args],
      createParser: createPsParser
    }
  }
  if ((name === 'ps' || name === 'tasklist') && platform === 'windows') {
    return {
      semantic: 'process-list',
      command: 'tasklist',
      args: ['/FO', 'CSV', '/NH'],
      shellLine: semanticEquivalents['process-list'].windows,
      createParser: createTasklistParser
    }
  }
  if (name === 'df') {
    return { semantic: 'disk-usage', command: 'df', args: [...args], createParser: createDfParser }
  }
  const port = name === 'lsof' || name === 'netstat' ? commandPort(args) ?? (name === 'netstat' ? '' : undefined) : undefined
  if (port !== undefined && platform === 'windows') {
    const shellLine = port
      ? semanticEquivalents['port-listeners'].windows.replace('{port}', port)
      : 'netstat -ano'
    return {
      semantic: 'port-listeners',
      command: 'netstat',
      args: port ? ['-ano', port] : ['-ano'],
      shellLine,
      createParser: createNetstatParser
    }
  }
  return undefined
}

export function canStructure(
  command: string,
  args: readonly string[],
  platform: StructuredPlatform
): boolean {
  return resolveStructured(command, args, platform) !== undefined
}
