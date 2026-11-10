import { homedir } from 'node:os'
import { createDefaultRegistry } from '../commands/registry'
import { parseCommandLine } from '../parser'
import { RiskPolicy, type RiskDecision } from './risk-policy'

const registry = createDefaultRegistry()
const policy = new RiskPolicy()

export interface DispatchDecision extends RiskDecision {
  knownCommand: boolean
}

function commandName(line: string): string {
  const parsed = parseCommandLine(line)
  if (parsed.ok && parsed.ast.kind === 'command') return parsed.ast.name
  const match = /^\s*([^\s|;&]+)/.exec(line)
  return match?.[1] ?? ''
}

export function assessSubmittedLine(
  line: string,
  cwd = homedir(),
  platform: NodeJS.Platform = process.platform
): DispatchDecision {
  const rawInput = line.trim()
  if (!rawInput) {
    return {
      action: 'allow',
      ruleId: 'empty-line',
      reason: '空输入',
      irreversible: false,
      audit: false,
      knownCommand: true
    }
  }
  const parsed = parseCommandLine(rawInput)
  const name = commandName(rawInput)
  const knownCommand = name ? registry.resolve(name) !== undefined : false
  const decision = policy.evaluate({
    rawInput,
    ...(parsed.ok ? { ast: parsed.ast } : {}),
    cwd,
    platform
  })
  return { ...decision, knownCommand, audit: decision.action !== 'allow' }
}

export { policy as riskPolicy, registry as commandRegistry }
