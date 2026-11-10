export type PreviewKind = 'markdown' | 'csv' | 'image' | 'video' | 'pdf' | 'text' | 'none'

const KINDS: Record<string, PreviewKind> = {
  md: 'markdown',
  markdown: 'markdown',
  csv: 'csv',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  ico: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  pdf: 'pdf',
  txt: 'text',
  json: 'text',
  yaml: 'text',
  yml: 'text',
  xml: 'text',
  log: 'text',
  ts: 'text',
  tsx: 'text',
  js: 'text',
  jsx: 'text',
  css: 'text',
  html: 'text',
  sh: 'text'
}

export function previewKind(name: string): PreviewKind {
  const base = name.split(/[/\\]/).pop() ?? name
  const extension = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : ''
  return KINDS[extension] ?? 'none'
}

export function previewMime(name: string): string {
  const extension = (name.split(/[/\\]/).pop() ?? name).split('.').pop()?.toLowerCase() ?? ''
  const mime: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    pdf: 'application/pdf',
    csv: 'text/csv',
    json: 'application/json',
    md: 'text/markdown'
  }
  return mime[extension] ?? 'application/octet-stream'
}

export function previewUrl(filePath: string, token = ''): string {
  const url = new URL('unixbridge://preview/file')
  url.searchParams.set('path', filePath)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}
