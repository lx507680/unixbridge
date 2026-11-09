const LS_LONG_LINE =
  /^(?<mode>[-dlcbps][-rwxXsStT]{9}[@+.]*)\s+(?<links>\d+)\s+(?<owner>\S+)\s+(?<group>\S+)\s+(?<size>\S+)\s+(?<mtime>(?:\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})|(?:\S{3}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})))\s+(?<name>.+)$/

const PS_AUX_LINE =
  /^(?<user>\S+)\s+(?<pid>\d+)\s+(?<cpu>[\d.]+)\s+(?<mem>[\d.]+)\s+(?<vsz>\d+)\s+(?<rss>\d+)\s+(?<tty>\S+)\s+(?<stat>[A-Za-z+<]+)\s+(?<start>\S+)\s+(?<time>[\d:.]+)\s+(?<command>.+)$/

const DF_LINE =
  /^(?<filesystem>.+?)\s+(?<size>\S+)\s+(?<used>\S+)\s+(?<avail>\S+)\s+(?<use>\d+%)\s+(?<rest>.+)$/

const DF_MAC_REST =
  /^(?<iused>\S+)\s+(?<ifree>\S+)\s+(?<ipct>\d+%)\s+(?<mounted>.+)$/

function lines(raw: string): string[] {
  return raw.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim().length > 0)
}

export function parseLsOutput(raw: string): Array<Record<string, string>> {
  return lines(raw).flatMap((line) => {
    if (/^total\s+\d+/.test(line)) return []
    const match = LS_LONG_LINE.exec(line)
    if (!match?.groups) return []
    const { mode, links, owner, group, size, mtime, name } = match.groups
    return [{
      mode: mode ?? '',
      links: links ?? '',
      owner: owner ?? '',
      group: group ?? '',
      size: size ?? '',
      mtime: mtime ?? '',
      name: name ?? ''
    }]
  })
}

export function parsePsOutput(raw: string): Array<Record<string, string>> {
  return lines(raw).flatMap((line) => {
    if (/^USER\s+/.test(line)) return []
    const match = PS_AUX_LINE.exec(line.trim())
    if (!match?.groups) return []
    const { user, pid, cpu, mem, vsz, rss, stat, start, time, command } = match.groups
    return [{
      USER: user ?? '',
      PID: pid ?? '',
      '%CPU': cpu ?? '',
      '%MEM': mem ?? '',
      VSZ: vsz ?? '',
      RSS: rss ?? '',
      STAT: stat ?? '',
      START: start ?? '',
      TIME: time ?? '',
      COMMAND: command ?? ''
    }]
  })
}

export function parseDfOutput(raw: string): Array<Record<string, string>> {
  return lines(raw).flatMap((line) => {
    if (/^Filesystem\b/.test(line)) return []
    const match = DF_LINE.exec(line.trim())
    if (!match?.groups) return []
    const rest = match.groups.rest ?? ''
    const mac = DF_MAC_REST.exec(rest)
    return [{
      Filesystem: match.groups.filesystem ?? '',
      Size: match.groups.size ?? '',
      Used: match.groups.used ?? '',
      Avail: match.groups.avail ?? '',
      'Use%': match.groups.use ?? '',
      'Mounted-on': mac?.groups?.mounted ?? rest
    }]
  })
}
