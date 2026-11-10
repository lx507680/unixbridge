export type FileKind =
  | 'directory'
  | 'symlink'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'data'
  | 'markdown'
  | 'document'
  | 'file'

const KIND_LABEL: Record<FileKind, string> = {
  directory: '文件夹',
  symlink: '链接',
  pdf: 'PDF',
  image: '图片',
  video: '视频',
  audio: '音频',
  archive: '压缩包',
  code: '代码',
  data: '数据',
  markdown: 'MD',
  document: '文档',
  file: '文件'
}

const EXTENSIONS: Record<string, FileKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  ico: 'image',
  bmp: 'image',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  aac: 'audio',
  zip: 'archive',
  gz: 'archive',
  tgz: 'archive',
  bz2: 'archive',
  '7z': 'archive',
  rar: 'archive',
  tar: 'archive',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  py: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  c: 'code',
  h: 'code',
  cpp: 'code',
  css: 'code',
  scss: 'code',
  html: 'code',
  vue: 'code',
  sh: 'code',
  json: 'data',
  yaml: 'data',
  yml: 'data',
  xml: 'data',
  csv: 'data',
  toml: 'data',
  md: 'markdown',
  txt: 'document',
  doc: 'document',
  docx: 'document',
  rtf: 'document',
  pages: 'document'
}

export function fileDisplayName(rawName: string): string {
  return (rawName.split(' -> ')[0] ?? rawName).replace(/\/$/, '')
}

export function classifyFile(rawName: string, mode = ''): FileKind {
  if (mode.startsWith('d') || rawName.endsWith('/')) return 'directory'
  if (mode.startsWith('l') || rawName.includes(' -> ')) return 'symlink'
  const name = fileDisplayName(rawName).toLowerCase()
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  return EXTENSIONS[extension] ?? 'file'
}

const KIND_MARK: Record<FileKind, string> = {
  directory: '',
  symlink: '↗',
  pdf: 'PDF',
  image: 'IMG',
  video: '▶',
  audio: '♪',
  archive: 'ZIP',
  code: '</>',
  data: '{}',
  markdown: 'MD',
  document: 'DOC',
  file: 'FILE'
}

export function fileKindLabel(kind: FileKind): string {
  return KIND_LABEL[kind]
}

export function fileKindMark(kind: FileKind): string {
  return KIND_MARK[kind]
}

export function resolveListedPath(directory: string, rawName: string): string {
  const name = fileDisplayName(rawName)
  const sep = directory.includes('\\') && !directory.includes('/') ? '\\' : '/'
  const base = directory.replace(/[\\/]+$/, '') || (directory.startsWith('/') ? '/' : directory)
  if (!name || name === '.') return base
  if (name === '..') {
    const parts = base.split(/[\\/]/)
    if (parts.length <= 1) return base.startsWith('/') ? '/' : base
    parts.pop()
    return parts.join(sep) || (base.startsWith('/') ? '/' : base)
  }
  if (!base) return name
  return `${base}${sep}${name}`
}
