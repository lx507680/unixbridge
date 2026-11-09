export interface HistoryEntry {
  id: string
  input: string
  cwd: string
  exitCode: number
  timestamp: string
}

export interface ShellStateSnapshot {
  cwd: string
  env: Readonly<Record<string, string>>
  aliases: Readonly<Record<string, string>>
  lastExitCode: number
  history: readonly HistoryEntry[]
}

export class ShellState {
  cwd: string
  readonly env: Record<string, string>
  readonly aliases: Record<string, string>
  lastExitCode = 0
  readonly history: HistoryEntry[] = []

  constructor(
    cwd = process.cwd(),
    env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
    private readonly historyLimit = 500
  ) {
    this.cwd = cwd
    this.env = { ...env }
    this.aliases = {}
  }

  addHistory(input: string, exitCode: number): HistoryEntry {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      input,
      cwd: this.cwd,
      exitCode,
      timestamp: new Date().toISOString()
    }
    this.history.push(entry)
    if (this.history.length > this.historyLimit) this.history.shift()
    this.lastExitCode = exitCode
    return entry
  }

  snapshot(): ShellStateSnapshot {
    return {
      cwd: this.cwd,
      env: { ...this.env },
      aliases: { ...this.aliases },
      lastExitCode: this.lastExitCode,
      history: [...this.history]
    }
  }
}
