import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { renderSemanticTable } from '../core/output/semantic-table'
import { parseCommandLine } from '../core/parser'
import type { ColumnDef } from '../preload'
import './style.css'

function element<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`界面元素初始化失败: ${selector}`)
  return node
}

const container = element<HTMLElement>('#terminal')
const status = element<HTMLElement>('#session-status')
const commandSearch = element<HTMLInputElement>('#command-search')
const commandSearchResults = element<HTMLElement>('#command-search-results')
const settingsPopover = element<HTMLElement>('#settings-popover')
const settingsButton = element<HTMLButtonElement>('#view-settings')
const topSettingsButton = element<HTMLButtonElement>('#top-settings')
const closeSettingsButton = element<HTMLButtonElement>('#close-settings')
const workspaceTitleLabel = element<HTMLElement>('#workspace-title-label')
const workspaceSubtitle = element<HTMLElement>('#workspace-subtitle')
const sessionList = element<HTMLElement>('#session-list')
const sessionCount = element<HTMLElement>('#session-count')
const sessionEditor = element<HTMLElement>('#session-editor')
const sessionNameInput = element<HTMLInputElement>('#session-name')
const aiPanel = element<HTMLElement>('#ai-panel')
const metricsWidget = element<HTMLElement>('#metrics-widget')
const filesWidget = element<HTMLElement>('#files-widget')
const widgetsPanel = element<HTMLElement>('#widgets-panel')
const workbench = element<HTMLElement>('#workbench')
const aiResizer = element<HTMLElement>('#ai-resizer')
const widgetsResizer = element<HTMLElement>('#widgets-resizer')
const settingsResizer = element<HTMLElement>('#settings-resizer')
const aiWidthInput = element<HTMLInputElement>('#ai-width')
const widgetsWidthInput = element<HTMLInputElement>('#widgets-width')
const aiWidthValue = element<HTMLOutputElement>('#ai-width-value')
const widgetsWidthValue = element<HTMLOutputElement>('#widgets-width-value')
const fontSizeInput = element<HTMLInputElement>('#font-size')
const fontSizeValue = element<HTMLOutputElement>('#font-size-value')
const fontFamilyInput = element<HTMLSelectElement>('#font-family')
const settingsWidthInput = element<HTMLInputElement>('#settings-width')
const settingsWidthValue = element<HTMLOutputElement>('#settings-width-value')
const aiForm = element<HTMLFormElement>('#ai-form')
const aiInput = element<HTMLTextAreaElement>('#ai-input')
const aiMessages = element<HTMLElement>('#ai-messages')
const sendAiButton = element<HTMLButtonElement>('#send-ai')
const aiModeLabel = element<HTMLElement>('#ai-mode-label')
const aiEndpointInput = element<HTMLInputElement>('#ai-endpoint')
const aiModelInput = element<HTMLInputElement>('#ai-model')
const aiApiKeyInput = element<HTMLInputElement>('#ai-api-key')
const aiKeyLabel = element<HTMLElement>('#ai-key-label')
const saveAiConfigButton = element<HTMLButtonElement>('#save-ai-config')
const aiConfigStatus = element<HTMLElement>('#ai-config-status')
const processorKind = element<HTMLElement>('#processor-kind')
const processorName = element<HTMLElement>('#processor-name')
const processorValue = element<HTMLElement>('#processor-value')
const memoryValue = element<HTMLElement>('#memory-value')
const metricsLine = element<SVGPolylineElement>('#metrics-line')
const metricsArea = element<SVGPathElement>('#metrics-area')
const filesPath = element<HTMLElement>('#files-path')
const fileList = element<HTMLElement>('#file-list')
const filesUpButton = element<HTMLButtonElement>('#files-up')
const filesRefreshButton = element<HTMLButtonElement>('#files-refresh')
const toggleAiButton = element<HTMLButtonElement>('#toggle-ai')
const closeAiButton = element<HTMLButtonElement>('#close-ai')
const terminalContext = element<HTMLElement>('#terminal-context')
const semanticBlock = element<HTMLElement>('#semantic-block')
const semanticHeader = element<HTMLElement>('#semantic-header')
const semanticLegend = element<HTMLElement>('#semantic-legend')
const semanticDetails = element<HTMLElement>('#semantic-details')
const semanticToggle = element<HTMLButtonElement>('#semantic-toggle')
const contextRuntime = element<HTMLElement>('#context-runtime')
const contextDirectory = element<HTMLElement>('#context-directory')
const contextBranch = element<HTMLElement>('#context-branch')
const contextChanges = element<HTMLElement>('#context-changes')
const contextCommand = element<HTMLElement>('#context-command')

workbench.append(settingsResizer, settingsPopover)

type ViewMode = 'panes' | 'tabs'
type Density = 'comfortable' | 'compact'
type PaneTitle = 'command' | 'directory' | 'branch'
type Theme = 'light' | 'dark'
type LayoutMode = 'balanced' | 'terminal' | 'assistant'

interface AppearanceSettings {
  view: ViewMode
  density: Density
  title: PaneTitle
  metadata: string[]
  theme: Theme
  sessionName: string
  sessionColor: string
  layout: LayoutMode
  panels: string[]
  aiWidth: number
  widgetsWidth: number
  fontSize: number
  fontFamily: string
  settingsWidth: number
}

const defaultSettings: AppearanceSettings = {
  view: 'panes',
  density: 'comfortable',
  title: 'command',
  metadata: ['branch', 'directory'],
  theme: 'light',
  sessionName: '本地终端',
  sessionColor: '#73b7c8',
  layout: 'balanced',
  panels: ['ai', 'metrics', 'files'],
  aiWidth: 220,
  widgetsWidth: 240,
  fontSize: 12,
  fontFamily: 'Cascadia Code',
  settingsWidth: 320
}

function loadSettings(): AppearanceSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('unixbridge:appearance') ?? '{}') as Partial<AppearanceSettings>
    return { ...defaultSettings, ...saved }
  } catch {
    return { ...defaultSettings }
  }
}

const appearance = loadSettings()

interface AiPreferences {
  provider: 'local' | 'api'
  endpoint: string
  model: string
}

const aiPreferences: AiPreferences = (() => {
  const defaults: AiPreferences = {
    provider: 'local',
    endpoint: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5-coder:7b'
  }
  try {
    return {
      ...defaults,
      ...(JSON.parse(localStorage.getItem('unixbridge:ai-preferences') ?? '{}') as Partial<AiPreferences>)
    }
  } catch {
    return defaults
  }
})()

const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
  {
    role: 'system',
    content: '你是 unixbridge 终端助手。回答要简洁、安全，危险命令必须明确提示风险。'
  }
]
const commandHistory: string[] = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('unixbridge:command-history') ?? '[]')
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
})()
const metricHistory: number[] = []
let currentFilePath: string | undefined

const terminalThemes = {
  light: {
    background: '#ffffff',
    foreground: '#242428',
    cursor: '#675bd4',
    selectionBackground: '#dcd8f7',
    black: '#242428',
    red: '#c93c54',
    green: '#23855f',
    yellow: '#9a6b16',
    blue: '#3568b8',
    magenta: '#7752b8',
    cyan: '#28798a',
    white: '#f7f7f8'
  },
  dark: {
    background: '#111114',
    foreground: '#dddde2',
    cursor: '#a19afb',
    selectionBackground: '#36334f',
    black: '#111114',
    red: '#ff6f82',
    green: '#66d19e',
    yellow: '#dbb96d',
    blue: '#7aa2ef',
    magenta: '#b69af5',
    cyan: '#72c7d4',
    white: '#f1f1f3'
  }
} as const

const terminal = new Terminal({
  cursorBlink: true,
  convertEol: true,
  fontFamily: `"${appearance.fontFamily}", "Cascadia Code", "JetBrains Mono", Consolas, monospace`,
  fontSize: 12,
  lineHeight: 1.35,
  scrollback: 10_000,
  theme: terminalThemes[appearance.theme]
})
const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
terminal.open(container)
fitAddon.fit()

interface UiSession {
  id: string
  name: string
  color: string
  platform: NodeJS.Platform | null
  platformLabel: string
  statusText: string
  statusState: '' | 'running' | 'stopped'
  output: string
  inputBuffer: string
  currentDirectory?: string
}

const uiSessions = new Map<string, UiSession>()
let activeSessionId = ''
let sessionSequence = 0

function getActiveSession(): UiSession | undefined {
  return uiSessions.get(activeSessionId)
}

function resizeActiveTerminal(): void {
  if (activeSessionId) window.unixbridge.resize(activeSessionId, terminal.cols, terminal.rows)
}

function sessionDisplayTitle(session: UiSession): string {
  if (appearance.title === 'directory') return '~/workspace'
  if (appearance.title === 'branch') return 'main'
  return session.name
}

function syncActiveSessionUi(): void {
  const session = getActiveSession()
  if (!session) return
  status.textContent = session.statusText
  status.dataset.state = session.statusState
  workspaceTitleLabel.textContent = session.name
  workspaceSubtitle.textContent = appearance.title === 'branch' ? 'main' : '~/workspace'
  document.documentElement.style.setProperty('--session-color', session.color)
  if (document.activeElement !== sessionNameInput) sessionNameInput.value = session.name
  for (const button of document.querySelectorAll<HTMLButtonElement>('.color-options [data-color]')) {
    button.classList.toggle('is-selected', button.dataset.color === session.color)
  }
}

function renderSessionList(): void {
  sessionList.replaceChildren()
  sessionCount.textContent = String(uiSessions.size)
  for (const session of uiSessions.values()) {
    const card = document.createElement('div')
    card.className = 'session-card'
    card.style.setProperty('--session-card-color', session.color)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = `session-item${session.id === activeSessionId ? ' is-active' : ''}`
    button.dataset.sessionId = session.id
    button.innerHTML =
      '<span class="session-icon">›_</span><span class="session-copy"><strong></strong><small></small><small class="session-metadata"><span data-metadata="branch">⌘ main</span><span data-metadata="directory">~/workspace</span></small></span>'
    const title = button.querySelector('strong')!
    const platform = button.querySelector<HTMLElement>('.session-copy > small')!
    title.textContent = sessionDisplayTitle(session)
    platform.textContent = session.platformLabel
    if (session.id === activeSessionId) {
      title.id = 'session-title'
      platform.id = 'session-platform'
    }
    for (const node of button.querySelectorAll<HTMLElement>('[data-metadata]')) {
      node.hidden = !appearance.metadata.includes(node.dataset.metadata ?? '')
    }
    button.addEventListener('click', () => switchSession(session.id))

    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'session-edit'
    edit.textContent = '•••'
    edit.setAttribute('aria-label', `编辑 ${session.name}`)
    edit.addEventListener('click', (event) => {
      event.stopPropagation()
      if (activeSessionId !== session.id) switchSession(session.id)
      setSessionEditorOpen(sessionEditor.hidden)
    })

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'session-remove'
    remove.textContent = '×'
    remove.setAttribute('aria-label', `删除 ${session.name}`)
    remove.title = '删除终端会话'
    remove.addEventListener('click', (event) => {
      event.stopPropagation()
      removeSession(session.id)
    })
    card.append(button, edit, remove)
    sessionList.append(card)
  }
}

function switchSession(sessionId: string): void {
  const session = uiSessions.get(sessionId)
  if (!session || sessionId === activeSessionId) return
  activeSessionId = sessionId
  terminal.reset()
  if (session.output) terminal.write(session.output)
  renderSessionList()
  syncActiveSessionUi()
  requestAnimationFrame(() => {
    fitAddon.fit()
    resizeActiveTerminal()
    terminal.focus()
  })
}

function removeSession(sessionId: string): void {
  const wasActive = sessionId === activeSessionId
  if (!uiSessions.delete(sessionId)) return
  window.unixbridge.dispose(sessionId)

  if (!wasActive) {
    renderSessionList()
    return
  }

  setSessionEditorOpen(false)
  const nextSession = [...uiSessions.values()].at(-1)
  if (nextSession) {
    switchSession(nextSession.id)
    return
  }

  activeSessionId = ''
  terminal.reset()
  renderSessionList()
  void startSession()
}

function saveAndApplyAppearance(): void {
  localStorage.setItem('unixbridge:appearance', JSON.stringify(appearance))
  document.body.dataset.theme = appearance.theme
  document.body.dataset.view = appearance.view
  document.body.dataset.density = appearance.density
  document.body.dataset.layout = appearance.layout
  terminal.options.theme = terminalThemes[appearance.theme]
  terminal.options.fontSize = appearance.fontSize
  terminal.options.fontFamily = `"${appearance.fontFamily}", "Cascadia Code", "JetBrains Mono", Consolas, monospace`
  document.documentElement.style.setProperty('--ui-font-family', `"${appearance.fontFamily}"`)
  document.documentElement.style.setProperty('--ui-font-size', `${appearance.fontSize}px`)
  document.documentElement.style.setProperty(
    '--ui-font-small',
    `${Math.max(9, appearance.fontSize - 2)}px`
  )
  document.documentElement.style.setProperty(
    '--ui-font-tiny',
    `${Math.max(8, appearance.fontSize - 4)}px`
  )
  document.documentElement.style.setProperty('--ui-font-large', `${appearance.fontSize + 1}px`)
  document.documentElement.style.setProperty('--session-color', appearance.sessionColor)
  document.documentElement.style.setProperty('--ai-panel-width', `${appearance.aiWidth}px`)
  document.documentElement.style.setProperty('--widgets-panel-width', `${appearance.widgetsWidth}px`)
  document.documentElement.style.setProperty('--settings-panel-width', `${appearance.settingsWidth}px`)
  const effectiveAiWidth =
    appearance.layout === 'terminal'
      ? Math.min(appearance.aiWidth, 230)
      : appearance.layout === 'assistant'
        ? Math.max(appearance.aiWidth, 360)
        : appearance.aiWidth
  const effectiveWidgetsWidth =
    appearance.layout === 'terminal' ? Math.min(appearance.widgetsWidth, 250) : appearance.widgetsWidth
  document.documentElement.style.setProperty(
    '--ai-column',
    appearance.panels.includes('ai') ? `${effectiveAiWidth}px` : '0px'
  )
  document.documentElement.style.setProperty(
    '--widgets-column',
    appearance.panels.includes('metrics') || appearance.panels.includes('files')
      ? `${effectiveWidgetsWidth}px`
      : '0px'
  )
  document.documentElement.style.setProperty(
    '--ai-gutter',
    appearance.panels.includes('ai') ? '4px' : '0px'
  )
  document.documentElement.style.setProperty(
    '--widgets-gutter',
    appearance.panels.includes('metrics') || appearance.panels.includes('files') ? '4px' : '0px'
  )
  aiWidthInput.value = String(appearance.aiWidth)
  widgetsWidthInput.value = String(appearance.widgetsWidth)
  aiWidthValue.value = `${appearance.aiWidth}px`
  widgetsWidthValue.value = `${appearance.widgetsWidth}px`
  fontSizeInput.value = String(appearance.fontSize)
  fontSizeValue.value = `${appearance.fontSize}px`
  fontFamilyInput.value = appearance.fontFamily
  settingsWidthInput.value = String(appearance.settingsWidth)
  settingsWidthValue.value = `${appearance.settingsWidth}px`
  aiPanel.hidden = !appearance.panels.includes('ai')
  aiResizer.hidden = !appearance.panels.includes('ai')
  metricsWidget.hidden = !appearance.panels.includes('metrics')
  filesWidget.hidden = !appearance.panels.includes('files')
  widgetsPanel.hidden =
    !appearance.panels.includes('metrics') && !appearance.panels.includes('files')
  widgetsResizer.hidden = widgetsPanel.hidden
  toggleAiButton.classList.toggle('is-active', appearance.panels.includes('ai'))
  toggleAiButton.setAttribute('aria-pressed', String(appearance.panels.includes('ai')))
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-module]')) {
    const module = button.dataset.module
    button.classList.toggle(
      'is-active',
      module === 'terminal' || (module ? appearance.panels.includes(module) : false)
    )
  }

  renderSessionList()
  syncActiveSessionUi()

  for (const group of document.querySelectorAll<HTMLElement>('.segmented-control')) {
    const setting = group.dataset.setting as 'view' | 'density' | 'theme' | 'layout' | 'ai-provider'
    if (setting === 'ai-provider') continue
    for (const button of group.querySelectorAll<HTMLButtonElement>('button[data-value]')) {
      button.classList.toggle('is-selected', button.dataset.value === appearance[setting])
    }
  }

  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="pane-title"]')) {
    input.checked = input.value === appearance.title
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting="metadata"] input')) {
    input.checked = appearance.metadata.includes(input.value)
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting="panels"] input')) {
    input.checked = appearance.panels.includes(input.value)
  }
  requestAnimationFrame(() => {
    fitAddon.fit()
    resizeActiveTerminal()
  })
}

function setSettingsOpen(open: boolean, origin: 'sidebar' | 'top' = 'sidebar'): void {
  const wasOpen = !settingsPopover.hidden
  if (open) setSessionEditorOpen(false)
  settingsPopover.hidden = !open
  settingsResizer.hidden = !open
  document.documentElement.style.setProperty(
    '--settings-column',
    open ? `${appearance.settingsWidth}px` : '0px'
  )
  document.documentElement.style.setProperty('--settings-gutter', open ? '4px' : '0px')
  settingsButton.setAttribute('aria-expanded', String(open))
  settingsButton.classList.toggle('is-active', open)
  topSettingsButton.classList.toggle('is-active', open && origin === 'top')
  document.body.classList.toggle('settings-open', open)
  document.body.classList.toggle('settings-from-top', open && origin === 'top')
  requestAnimationFrame(() => {
    fitAddon.fit()
    resizeActiveTerminal()
  })
  window.setTimeout(() => {
    if (container.clientWidth > 0) {
      fitAddon.fit()
      resizeActiveTerminal()
    }
  }, 220)
  if (!open && wasOpen) {
    requestAnimationFrame(() => {
      const session = getActiveSession()
      if (session) session.inputBuffer = ''
      terminal.focus()
    })
  }
}

function setSessionEditorOpen(open: boolean): void {
  if (open) setSettingsOpen(false)
  sessionEditor.hidden = !open
  if (open) {
    syncActiveSessionUi()
    sessionNameInput.focus()
    sessionNameInput.select()
  }
}

for (const group of document.querySelectorAll<HTMLElement>('.segmented-control')) {
  group.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]')
    if (!button) return
    const setting = group.dataset.setting
    if (setting === 'ai-provider') return
    if (setting === 'view') appearance.view = button.dataset.value as ViewMode
    if (setting === 'density') appearance.density = button.dataset.value as Density
    if (setting === 'theme') appearance.theme = button.dataset.value as Theme
    if (setting === 'layout') appearance.layout = button.dataset.value as LayoutMode
    saveAndApplyAppearance()
  })
}

for (const input of document.querySelectorAll<HTMLInputElement>('input[name="pane-title"]')) {
  input.addEventListener('change', () => {
    if (!input.checked) return
    appearance.title = input.value as PaneTitle
    saveAndApplyAppearance()
  })
}

for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting="metadata"] input')) {
  input.addEventListener('change', () => {
    appearance.metadata = [...document.querySelectorAll<HTMLInputElement>(
      '[data-setting="metadata"] input:checked'
    )].map((item) => item.value)
    saveAndApplyAppearance()
  })
}

for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting="panels"] input')) {
  input.addEventListener('change', () => {
    appearance.panels = [...document.querySelectorAll<HTMLInputElement>(
      '[data-setting="panels"] input:checked'
    )].map((item) => item.value)
    saveAndApplyAppearance()
    if (appearance.panels.includes('metrics')) void refreshMetrics()
    if (appearance.panels.includes('files')) void loadFiles(currentFilePath)
  })
}

function togglePanel(panel: 'ai' | 'metrics' | 'files', force?: boolean): void {
  const shouldShow = force ?? !appearance.panels.includes(panel)
  appearance.panels = shouldShow
    ? [...new Set([...appearance.panels, panel])]
    : appearance.panels.filter((item) => item !== panel)
  saveAndApplyAppearance()
  if (shouldShow && panel === 'metrics') void refreshMetrics()
  if (shouldShow && panel === 'files') void loadFiles(currentFilePath)
}

toggleAiButton.addEventListener('click', () => togglePanel('ai'))
closeAiButton.addEventListener('click', () => togglePanel('ai', false))
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-module]')) {
  button.addEventListener('click', () => {
    const module = button.dataset.module
    if (module === 'terminal') {
      terminal.focus()
      return
    }
    if (module === 'ai' || module === 'metrics' || module === 'files') togglePanel(module)
  })
}

aiWidthInput.addEventListener('input', () => {
  appearance.aiWidth = Number(aiWidthInput.value)
  saveAndApplyAppearance()
})
widgetsWidthInput.addEventListener('input', () => {
  appearance.widgetsWidth = Number(widgetsWidthInput.value)
  saveAndApplyAppearance()
})
fontSizeInput.addEventListener('input', () => {
  appearance.fontSize = Number(fontSizeInput.value)
  saveAndApplyAppearance()
})
fontFamilyInput.addEventListener('change', () => {
  appearance.fontFamily = fontFamilyInput.value
  saveAndApplyAppearance()
})
settingsWidthInput.addEventListener('input', () => {
  appearance.settingsWidth = Number(settingsWidthInput.value)
  document.documentElement.style.setProperty('--settings-column', `${appearance.settingsWidth}px`)
  saveAndApplyAppearance()
})

let settingsResizeClickPending = false

function installPanelResizer(
  handle: HTMLElement,
  side: 'ai' | 'widgets' | 'settings'
): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handle.setPointerCapture(event.pointerId)
    if (side === 'settings') settingsResizeClickPending = true
    handle.classList.add('is-dragging')
    const startX = event.clientX
    const startWidth =
      side === 'ai'
        ? appearance.aiWidth
        : side === 'widgets'
          ? appearance.widgetsWidth
          : appearance.settingsWidth

    const onMove = (moveEvent: PointerEvent): void => {
      const delta = moveEvent.clientX - startX
      const requested = side === 'ai' ? startWidth + delta : startWidth - delta
      const minWidth = side === 'ai' ? 200 : side === 'widgets' ? 220 : 280
      const maxWidth = 420
      const width = Math.max(minWidth, Math.min(maxWidth, Math.round(requested / 10) * 10))
      if (side === 'ai') {
        appearance.layout = 'balanced'
        appearance.aiWidth = width
        aiWidthInput.value = String(width)
        aiWidthValue.value = `${width}px`
        document.documentElement.style.setProperty('--ai-column', `${width}px`)
      } else if (side === 'widgets') {
        appearance.layout = 'balanced'
        appearance.widgetsWidth = width
        widgetsWidthInput.value = String(width)
        widgetsWidthValue.value = `${width}px`
        document.documentElement.style.setProperty('--widgets-column', `${width}px`)
      } else {
        appearance.settingsWidth = width
        settingsWidthInput.value = String(width)
        settingsWidthValue.value = `${width}px`
        document.documentElement.style.setProperty('--settings-column', `${width}px`)
      }
      fitAddon.fit()
      resizeActiveTerminal()
    }

    const onUp = (): void => {
      handle.classList.remove('is-dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      saveAndApplyAppearance()
      window.setTimeout(() => {
        settingsResizeClickPending = false
      }, 0)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  })

  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 10 : -10
    if (side === 'ai') appearance.aiWidth = Math.max(200, Math.min(420, appearance.aiWidth + delta))
    else if (side === 'widgets') {
      appearance.widgetsWidth = Math.max(220, Math.min(420, appearance.widgetsWidth - delta))
    } else {
      appearance.settingsWidth = Math.max(280, Math.min(420, appearance.settingsWidth - delta))
    }
    if (side !== 'settings') appearance.layout = 'balanced'
    saveAndApplyAppearance()
    if (side === 'settings') {
      document.documentElement.style.setProperty('--settings-column', `${appearance.settingsWidth}px`)
    }
  })
}

installPanelResizer(aiResizer, 'ai')
installPanelResizer(widgetsResizer, 'widgets')
installPanelResizer(settingsResizer, 'settings')

function syncAiSettings(): void {
  aiEndpointInput.value = aiPreferences.endpoint
  aiModelInput.value = aiPreferences.model
  aiKeyLabel.hidden = aiPreferences.provider !== 'api'
  aiModeLabel.textContent = aiPreferences.provider === 'local' ? '本地模型' : 'API 模型'
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-setting="ai-provider"] [data-value]'
  )) {
    button.classList.toggle('is-selected', button.dataset.value === aiPreferences.provider)
  }
}

document.querySelector<HTMLElement>('[data-setting="ai-provider"]')?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]')
  if (!button) return
  aiPreferences.provider = button.dataset.value as 'local' | 'api'
  if (aiPreferences.provider === 'local' && aiEndpointInput.value.startsWith('https://api.')) {
    aiPreferences.endpoint = 'http://127.0.0.1:11434/v1'
  }
  syncAiSettings()
})

async function configureAi(showSuccess = true): Promise<void> {
  aiPreferences.endpoint = aiEndpointInput.value.trim()
  aiPreferences.model = aiModelInput.value.trim()
  localStorage.setItem('unixbridge:ai-preferences', JSON.stringify(aiPreferences))
  aiConfigStatus.textContent = '正在连接…'
  try {
    await window.unixbridge.configureAi({
      ...aiPreferences,
      ...(aiApiKeyInput.value ? { apiKey: aiApiKeyInput.value } : {})
    })
    aiConfigStatus.textContent = showSuccess ? 'AI 配置已保存并可用' : 'AI 已就绪'
  } catch (error) {
    aiConfigStatus.textContent = error instanceof Error ? error.message : String(error)
    throw error
  }
}

saveAiConfigButton.addEventListener('click', () => {
  void configureAi().catch(() => undefined)
})

function appendInlineMarkdown(target: HTMLElement, content: string): void {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let cursor = 0
  for (const match of content.matchAll(tokenPattern)) {
    const index = match.index ?? 0
    if (index > cursor) target.append(document.createTextNode(content.slice(cursor, index)))
    const token = match[0]
    const node =
      token.startsWith('**') ? document.createElement('strong') :
        token.startsWith('`') ? document.createElement('code') : document.createElement('em')
    node.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1)
    target.append(node)
    cursor = index + token.length
  }
  if (cursor < content.length) target.append(document.createTextNode(content.slice(cursor)))
}

function renderMarkdown(target: HTMLElement, markdown: string): void {
  target.replaceChildren()
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      index += 1
      while (index < lines.length) {
        const codeLine = lines[index] ?? ''
        if (codeLine.startsWith('```')) break
        codeLines.push(codeLine)
        index += 1
      }
      if (index < lines.length) index += 1
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      if (language) code.dataset.language = language
      code.textContent = codeLines.join('\n')
      pre.append(code)
      target.append(pre)
      continue
    }

    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/)
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2] ?? '')
      const list = document.createElement(ordered ? 'ol' : 'ul')
      while (index < lines.length) {
        const itemMatch = (lines[index] ?? '').match(/^(\s*)([-*]|\d+\.)\s+(.+)$/)
        if (!itemMatch || /\d+\./.test(itemMatch[2] ?? '') !== ordered) break
        const item = document.createElement('li')
        appendInlineMarkdown(item, itemMatch[3] ?? '')
        list.append(item)
        index += 1
      }
      target.append(list)
      continue
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      const heading = document.createElement(`h${Math.min(4, (headingMatch[1] ?? '').length)}`)
      appendInlineMarkdown(heading, headingMatch[2] ?? '')
      target.append(heading)
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      const quote = document.createElement('blockquote')
      appendInlineMarkdown(quote, line.slice(2))
      target.append(quote)
      index += 1
      continue
    }

    if (!line.trim()) {
      index += 1
      continue
    }

    const paragraphLines = [line]
    index += 1
    while (index < lines.length) {
      const paragraphLine = lines[index] ?? ''
      if (
        !paragraphLine.trim() ||
        /^(#{1,4})\s+|^```|^(\s*)([-*]|\d+\.)\s+|^> /.test(paragraphLine)
      ) {
        break
      }
      paragraphLines.push(paragraphLine)
      index += 1
    }
    const paragraph = document.createElement('p')
    paragraphLines.forEach((paragraphLine, lineIndex) => {
      if (lineIndex > 0) paragraph.append(document.createElement('br'))
      appendInlineMarkdown(paragraph, paragraphLine)
    })
    target.append(paragraph)
  }
}

function appendAiMessage(role: 'user' | 'assistant', content: string): HTMLElement {
  aiMessages.querySelector('.ai-welcome')?.remove()
  const message = document.createElement('div')
  message.className = `ai-message is-${role}`
  const label = document.createElement('strong')
  label.textContent = role === 'user' ? '你' : 'AI'
  const body = document.createElement('div')
  body.className = 'ai-message-content'
  if (role === 'assistant') renderMarkdown(body, content)
  else body.textContent = content
  message.append(label, body)
  aiMessages.append(message)
  aiMessages.scrollTop = aiMessages.scrollHeight
  return message
}

aiForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const content = aiInput.value.trim()
  if (!content || sendAiButton.disabled) return
  aiInput.value = ''
  aiInput.style.height = ''
  chatMessages.push({ role: 'user', content })
  appendAiMessage('user', content)
  const pending = appendAiMessage('assistant', '')
  const pendingBody = pending.querySelector<HTMLElement>('.ai-message-content')!
  sendAiButton.disabled = true

  void (async () => {
    try {
      await configureAi(false)
      let streamedContent = ''
      await window.unixbridge.chatStream(chatMessages, (chunk) => {
        streamedContent += chunk
        renderMarkdown(pendingBody, streamedContent)
        aiMessages.scrollTop = aiMessages.scrollHeight
      })
      if (!streamedContent) renderMarkdown(pendingBody, 'AI 服务未返回内容')
      else chatMessages.push({ role: 'assistant', content: streamedContent })
    } catch (error) {
      pendingBody.textContent = error instanceof Error ? error.message : String(error)
      pending.classList.add('is-error')
    } finally {
      sendAiButton.disabled = false
      aiInput.focus()
    }
  })()
})

aiInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  aiForm.requestSubmit()
})

aiInput.addEventListener('input', () => {
  aiInput.style.height = 'auto'
  aiInput.style.height = `${Math.min(120, aiInput.scrollHeight)}px`
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function updateMetricChart(value: number): void {
  metricHistory.push(Math.max(0, Math.min(100, value)))
  if (metricHistory.length > 40) metricHistory.shift()
  const step = 300 / Math.max(39, metricHistory.length - 1)
  const points = metricHistory.map((item, index) => `${index * step},${120 - item * 1.1}`)
  metricsLine.setAttribute('points', points.join(' '))
  if (points.length) {
    metricsArea.setAttribute('d', `M ${points.join(' L ')} L ${(points.length - 1) * step},120 L 0,120 Z`)
  }
}

async function refreshMetrics(): Promise<void> {
  if (metricsWidget.hidden) return
  try {
    const metrics = await window.unixbridge.metrics()
    processorKind.textContent = metrics.processor.kind.toUpperCase()
    processorName.textContent = metrics.processor.name
    processorValue.textContent = `${Math.round(metrics.processor.usage)}%`
    memoryValue.textContent = `${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`
    updateMetricChart(metrics.processor.usage)
  } catch (error) {
    processorName.textContent = error instanceof Error ? error.message : String(error)
  }
}

async function loadFiles(path?: string): Promise<void> {
  fileList.textContent = '正在读取…'
  try {
    const listing = await window.unixbridge.listFiles(path)
    currentFilePath = listing.path
    filesPath.textContent = listing.path
    filesUpButton.disabled = !listing.parent
    filesUpButton.dataset.parent = listing.parent ?? ''
    fileList.replaceChildren()
    for (const item of listing.items) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'file-row'
      row.draggable = true
      row.title =
        item.type === 'directory'
          ? `打开或拖到终端：${item.path}`
          : `拖到终端，在所在目录执行命令：${listing.path}`
      const name = document.createElement('span')
      name.textContent = `${item.type === 'directory' ? '▰' : '·'} ${item.name}`
      const size = document.createElement('span')
      size.textContent = item.type === 'directory' ? '目录' : formatBytes(item.size)
      row.append(name, size)
      if (item.type === 'directory') row.addEventListener('click', () => void loadFiles(item.path))
      row.addEventListener('dragstart', (event) => {
        const targetDirectory = item.type === 'directory' ? item.path : listing.path
        draggedDirectory = targetDirectory
        row.classList.add('is-dragging')
        event.dataTransfer?.setData('application/x-unixbridge-directory', targetDirectory)
        event.dataTransfer?.setData('text/plain', targetDirectory)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
      })
      row.addEventListener('dragend', () => {
        draggedDirectory = undefined
        row.classList.remove('is-dragging')
        container.classList.remove('is-directory-drop-target')
      })
      fileList.append(row)
    }
  } catch (error) {
    fileList.textContent = error instanceof Error ? error.message : String(error)
  }
}

filesUpButton.addEventListener('click', () => {
  const parent = filesUpButton.dataset.parent
  if (parent) void loadFiles(parent)
})
filesRefreshButton.addEventListener('click', () => void loadFiles(currentFilePath))

function quoteDirectory(path: string, platform: NodeJS.Platform | null): string {
  if (platform === 'win32') return `'${path.replaceAll("'", "''")}'`
  return `'${path.replaceAll("'", "'\\''")}'`
}

function changeTerminalDirectory(path: string): void {
  const session = getActiveSession()
  if (!session || !path) return
  const command =
    session.platform === 'win32'
      ? `Set-Location -LiteralPath ${quoteDirectory(path, session.platform)}`
      : `cd -- ${quoteDirectory(path, session.platform)}`
  recordCommand(command)
  window.unixbridge.write(session.id, `${command}\r`)
  session.inputBuffer = ''
  session.currentDirectory = path
  workspaceSubtitle.textContent = path
  void loadFiles(path)
  terminal.focus()
}

let draggedDirectory: string | undefined

function isTerminalDropTarget(target: EventTarget | null): boolean {
  return target instanceof Node && container.contains(target)
}

document.addEventListener('dragover', (event) => {
  if (!draggedDirectory || !isTerminalDropTarget(event.target)) {
    container.classList.remove('is-directory-drop-target')
    return
  }
  event.preventDefault()
  container.classList.add('is-directory-drop-target')
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}, true)

document.addEventListener('drop', (event) => {
  const path =
    event.dataTransfer?.getData('application/x-unixbridge-directory') || draggedDirectory
  if (!path || !isTerminalDropTarget(event.target)) return
  event.preventDefault()
  event.stopPropagation()
  container.classList.remove('is-directory-drop-target')
  draggedDirectory = undefined
  changeTerminalDirectory(path)
}, true)

const removeDataListener = window.unixbridge.onData((sessionId, data) => {
  const session = uiSessions.get(sessionId)
  if (!session) return
  session.output = `${session.output}${data}`.slice(-1_000_000)
  if (sessionId === activeSessionId) terminal.write(data)
})
const removeExitListener = window.unixbridge.onExit((sessionId, exitCode) => {
  const session = uiSessions.get(sessionId)
  if (!session) return
  const message = `\r\n\x1b[33m[unixbridge] 终端已退出，退出码 ${exitCode}\x1b[0m\r\n`
  session.statusText = `会话已退出 (${exitCode})`
  session.statusState = 'stopped'
  session.platformLabel = `已退出 · Code ${exitCode}`
  session.output = `${session.output}${message}`.slice(-1_000_000)
  if (sessionId === activeSessionId) terminal.write(message)
  renderSessionList()
  syncActiveSessionUi()
})

function recordCommand(command: string): void {
  const normalized = command.trim()
  if (!normalized) return
  if (commandHistory[commandHistory.length - 1] !== normalized) commandHistory.push(normalized)
  if (commandHistory.length > 200) commandHistory.splice(0, commandHistory.length - 200)
  localStorage.setItem('unixbridge:command-history', JSON.stringify(commandHistory))
}

interface StructuredRequest {
  command: 'ls' | 'ps' | 'df'
  args: string[]
  expanded: boolean
}

function parseStructuredRequest(input: string): StructuredRequest | undefined {
  const parsed = parseCommandLine(input)
  if (!parsed.ok || parsed.ast.kind !== 'command') return undefined
  const command = parsed.ast.name.toLowerCase()
  if (command !== 'ls' && command !== 'ps' && command !== 'df') return undefined
  const args = [...parsed.ast.args]
  const expanded = args.at(-1) === '?'
  if (expanded) args.pop()
  return { command, args, expanded }
}

function renderSemanticMetadata(
  columns: ColumnDef[],
  rows: Array<Record<string, string | number>>,
  expanded: boolean
): void {
  const rendered = renderSemanticTable(columns, rows, expanded)
  semanticHeader.textContent = rendered.headerText
  semanticLegend.textContent = rendered.legendText
  semanticDetails.replaceChildren()
  for (const column of columns) {
    const item = document.createElement('p')
    const title = document.createElement('strong')
    title.textContent = `${column.header} (${column.key})`
    item.append(title, document.createTextNode(` ${column.detailed ?? column.description}`))
    item.dataset.type = column.type ?? 'default'
    semanticDetails.append(item)
  }
  semanticDetails.hidden = !expanded
  semanticToggle.setAttribute('aria-expanded', String(expanded))
  semanticBlock.hidden = false
}

function toggleSemanticDetails(): void {
  if (semanticBlock.hidden) return
  const expanded = semanticDetails.hidden
  semanticDetails.hidden = !expanded
  semanticToggle.setAttribute('aria-expanded', String(expanded))
}

semanticToggle.addEventListener('click', () => toggleSemanticDetails())

async function showStructuredMetadata(
  session: UiSession,
  rawInput: string,
  request: StructuredRequest
): Promise<void> {
  recordCommand(rawInput)
  void showWorkspaceContext(request.args.length > 0 ? `${request.command} ${request.args.join(' ')}` : request.command)
  try {
    const result = await window.unixbridge.structuredCommand(
      request.command,
      request.args,
      session.currentDirectory ?? currentFilePath
    )
    if (session.id !== activeSessionId) return
    renderSemanticMetadata(result.columns, result.rows, request.expanded)
  } catch (error) {
    if (session.id !== activeSessionId) return
    semanticBlock.hidden = false
    semanticHeader.textContent = request.command
    semanticLegend.textContent = error instanceof Error ? error.message : String(error)
    semanticDetails.hidden = true
  }
}

async function showWorkspaceContext(command: string): Promise<void> {
  try {
    const context = await window.unixbridge.workspaceContext()
    const pathParts = context.directory.split(/[\\/]/).filter(Boolean)
    contextRuntime.textContent = context.runtime
    contextDirectory.textContent = `…/${pathParts.slice(-2).join('/')}`
    contextDirectory.title = context.directory
    contextBranch.textContent = context.branch ?? '无 Git 分支'
    contextChanges.textContent = `${context.changes} changes`
    contextCommand.textContent = command
    terminalContext.hidden = false
    requestAnimationFrame(() => {
      fitAddon.fit()
      resizeActiveTerminal()
      terminal.scrollToBottom()
    })
  } catch {
    terminalContext.hidden = true
    requestAnimationFrame(() => {
      fitAddon.fit()
      resizeActiveTerminal()
    })
  }
}

terminal.onData((data) => {
  const session = getActiveSession()
  if (!session) return
  if (data === '\u0007' && !semanticBlock.hidden) {
    toggleSemanticDetails()
    return
  }

  if (data === '\r' || data === '\n') {
    const command = session.inputBuffer.trim()
    const structured = command ? parseStructuredRequest(command) : undefined
    if (structured) {
      session.inputBuffer = ''
      if (structured.expanded) window.unixbridge.write(session.id, '\u007f')
      window.unixbridge.write(session.id, data)
      void showStructuredMetadata(session, command, structured)
      return
    }
  }

  window.unixbridge.write(session.id, data)
  if (data.startsWith('\u001b')) return
  for (const character of data) {
    if (character === '\r' || character === '\n') {
      const command = session.inputBuffer.trim()
      session.inputBuffer = ''
      if (command) {
        recordCommand(command)
        void showWorkspaceContext(command)
      }
    } else if (character === '\u007f') {
      session.inputBuffer = session.inputBuffer.slice(0, -1)
    } else if (character === '\u0003') {
      session.inputBuffer = ''
    } else if (character >= ' ') {
      session.inputBuffer += character
    }
  }
})

let resizeFrame = 0
const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    if (container.clientWidth === 0 || container.clientHeight === 0) return
    try {
    fitAddon.fit()
      resizeActiveTerminal()
    } catch {
      // The terminal can be temporarily hidden while filtering command history.
    }
  })
})
resizeObserver.observe(container)

function setConnectionState(session: UiSession, platform: NodeJS.Platform, pid: number): void {
  const isWindows = platform === 'win32'
  session.platform = platform
  const label = isWindows ? 'PowerShell · ConPTY' : '开发 shell · 非 ConPTY'
  session.statusText = `${label} · PID ${pid}`
  session.statusState = 'running'
  session.platformLabel = `${isWindows ? 'PowerShell' : 'Local shell'} · PID ${pid}`
  renderSessionList()
  if (session.id === activeSessionId) syncActiveSessionUi()
}

async function startSession(): Promise<void> {
  sessionSequence += 1
  const sessionId =
    window.crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${sessionSequence}`
  const session: UiSession = {
    id: sessionId,
    name: sessionSequence === 1 ? appearance.sessionName : `终端 ${sessionSequence}`,
    color: appearance.sessionColor,
    platform: null,
    platformLabel: '正在连接…',
    statusText: '正在启动终端…',
    statusState: '',
    output: '',
    inputBuffer: ''
  }
  uiSessions.set(sessionId, session)
  activeSessionId = sessionId
  terminal.reset()
  commandSearch.value = ''
  filterCommands('')
  setSessionEditorOpen(false)
  renderSessionList()
  syncActiveSessionUi()

  try {
    fitAddon.fit()
    const { platform, pid } = await window.unixbridge.start(
      sessionId,
      terminal.cols,
      terminal.rows
    )
    setConnectionState(session, platform, pid)
    terminal.focus()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const output = `\x1b[31m[unixbridge] ${message}\x1b[0m\r\n`
    session.statusText = '启动失败'
    session.statusState = 'stopped'
    session.platformLabel = '连接失败'
    session.output = output
    renderSessionList()
    if (session.id === activeSessionId) {
      syncActiveSessionUi()
      terminal.write(output)
    }
  }
}

function filterCommands(rawQuery: string): void {
  const query = rawQuery.trim().toLocaleLowerCase()
  commandSearchResults.replaceChildren()
  if (!query) {
    commandSearchResults.hidden = true
    return
  }

  const matches = [...new Set([...commandHistory].reverse())]
    .filter((command) => command.toLocaleLowerCase().includes(query))
    .slice(0, 12)
  commandSearchResults.hidden = false
  if (matches.length === 0) {
    const empty = document.createElement('span')
    empty.className = 'search-result-empty'
    empty.textContent = '没有匹配的历史命令'
    commandSearchResults.append(empty)
    return
  }

  for (const command of matches) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = command
    button.title = '点击填入终端'
    button.addEventListener('click', () => {
      commandSearch.value = ''
      commandSearchResults.hidden = true
      const session = getActiveSession()
      if (!session) return
      session.inputBuffer = command
      window.unixbridge.write(session.id, command)
      terminal.focus()
    })
    commandSearchResults.append(button)
  }
}

commandSearch.addEventListener('input', () => filterCommands(commandSearch.value))
commandSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  commandSearch.value = ''
  filterCommands('')
  terminal.focus()
})

element<HTMLElement>('#new-session').addEventListener('click', () => void startSession())
element<HTMLElement>('#clear-terminal').addEventListener('click', () => {
  const session = getActiveSession()
  if (session) session.output = ''
  terminal.clear()
  terminal.focus()
})
settingsButton.addEventListener('click', (event) => {
  event.stopPropagation()
  setSettingsOpen(settingsPopover.hidden, 'sidebar')
})
topSettingsButton.addEventListener('click', (event) => {
  event.stopPropagation()
  setSettingsOpen(settingsPopover.hidden, 'top')
})
closeSettingsButton.addEventListener('click', () => setSettingsOpen(false))
settingsPopover.addEventListener('click', (event) => event.stopPropagation())
settingsResizer.addEventListener('click', (event) => event.stopPropagation())
sessionEditor.addEventListener('click', (event) => event.stopPropagation())
sessionNameInput.addEventListener('input', () => {
  const session = getActiveSession()
  if (!session) return
  session.name = sessionNameInput.value.trim() || '未命名会话'
  appearance.sessionName = session.name
  saveAndApplyAppearance()
})
sessionNameInput.addEventListener('blur', () => {
  if (sessionNameInput.value.trim()) return
  const session = getActiveSession()
  if (!session) return
  session.name = '本地终端'
  appearance.sessionName = session.name
  saveAndApplyAppearance()
})
for (const button of document.querySelectorAll<HTMLButtonElement>('.color-options [data-color]')) {
  button.addEventListener('click', () => {
    const session = getActiveSession()
    if (!session) return
    session.color = button.dataset.color ?? defaultSettings.sessionColor
    appearance.sessionColor = session.color
    saveAndApplyAppearance()
  })
}
document.addEventListener('click', () => {
  if (settingsResizeClickPending) return
  setSettingsOpen(false)
  setSessionEditorOpen(false)
})
element<HTMLElement>('#sidebar-toggle').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-collapsed')
  requestAnimationFrame(() => {
    fitAddon.fit()
    resizeActiveTerminal()
  })
})
element<HTMLElement>('#mobile-menu').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-open')
})

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    commandSearch.focus()
  }
  if ((event.metaKey || event.ctrlKey) && event.key === '1') {
    event.preventDefault()
    terminal.focus()
  }
})

window.addEventListener('beforeunload', () => {
  removeDataListener()
  removeExitListener()
  resizeObserver.disconnect()
  window.clearInterval(metricsTimer)
})

syncAiSettings()
saveAndApplyAppearance()
const metricsTimer = window.setInterval(() => void refreshMetrics(), 2_000)
void refreshMetrics()
void loadFiles()
void startSession()
