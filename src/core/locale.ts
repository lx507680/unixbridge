import { execFileSync } from 'node:child_process'

function localeFromApple(value: string): string | undefined {
  const base = value.trim().split('@')[0]
  if (!base) return undefined
  return base.includes('.') ? base : `${base}.UTF-8`
}

export function terminalLocale(): string | undefined {
  if (process.platform === 'darwin') {
    try {
      const apple = execFileSync('defaults', ['read', '-g', 'AppleLocale'], {
        encoding: 'utf8',
        timeout: 1000
      })
      const locale = localeFromApple(apple)
      if (locale) return locale
    } catch {
      // The process locale below remains the fallback.
    }
  }
  const lang = process.env.LANG
  if (lang && !/^C(?:\.UTF-8)?$/.test(lang) && lang !== 'POSIX') return lang
  return undefined
}

export function localeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const locale = terminalLocale()
  if (!locale) return base
  return {
    ...base,
    LANG: locale,
    LC_CTYPE: locale,
    LC_COLLATE: locale,
    LC_TIME: locale
  }
}
