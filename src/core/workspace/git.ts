export interface GitFileChange {
  status: string
  path: string
}

export function isSafeBranchName(name: string): boolean {
  return (
    /^[\w./-]{1,120}$/.test(name) &&
    !name.startsWith('-') &&
    !name.startsWith('/') &&
    !name.includes('..') &&
    !name.endsWith('/') &&
    !name.endsWith('.')
  )
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

export function parseGitStatus(stdout: string): GitFileChange[] {
  const files: GitFileChange[] = []
  const records = stdout.split('\0').filter((record) => record.length >= 4)
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? ''
    const status = record.slice(0, 2).trim() || record.slice(0, 2)
    let file = record.slice(3)
    if ((record.startsWith('R') || record.startsWith('C') || record.slice(0, 2).includes('R') || record.slice(0, 2).includes('C')) && records[index + 1]) {
      file = records[index + 1] ?? file
      index += 1
    }
    if (!file || file.startsWith('/') || file.includes('..') || file.includes('\0')) continue
    files.push({ status, path: file })
  }
  return files.slice(0, 80)
}

export function summarizeNumstat(stdout: string): { insertions: number; deletions: number } {
  let insertions = 0
  let deletions = 0
  for (const line of stdout.split(/\r?\n/)) {
    const [added, removed] = line.split('\t')
    if (added && /^\d+$/.test(added)) insertions += Number(added)
    if (removed && /^\d+$/.test(removed)) deletions += Number(removed)
  }
  return { insertions, deletions }
}

export function formatChangeChip(changes: number, insertions: number, deletions: number): string {
  if (insertions === 0 && deletions === 0) return `${changes} changes`
  const parts = [`${changes}`, '•']
  if (insertions > 0) parts.push(`+${insertions}`)
  if (deletions > 0) parts.push(`-${deletions}`)
  return parts.join(' ')
}
