import { randomBytes } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function writeAtomic(file: string, contents: string): Promise<void> {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`
  )
  await writeFile(temporary, contents)
  await rename(temporary, file)
}
