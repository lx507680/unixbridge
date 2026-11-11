import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { formatChangeChip, isSafeBranchName, shellQuote } from '../core/workspace/git'
import type { GitDetails, NodeRuntime, StoredGroup } from '../preload'
import { classifyFile, fileKindLabel, fileKindMark } from './file-icons'
import {
  explainCommandProblem,
  joinCompletionDirectory,
  completePathToken,
  pathCompletionQuery,
  suggestCommands,
  type CommandSuggestion
} from '../core/completion/commands'
import { translate } from '../core/translator'
import { parseSshTarget, type SshTarget } from '../core/ssh/target'
import { parseCommandLine } from '../core/parser'
import { canStructure, type StructuredPlatform } from '../core/structured'
import type { ColumnDef, PtyWriteResult } from '../preload'
import './style.css'

function element<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`界面元素初始化失败: ${selector}`)
  return node
}

const terminalRoot = element<HTMLElement>('#terminal')
const container = element<HTMLElement>('#terminal-screen')
const commandComplete = element<HTMLElement>('#command-complete')
const commandRisk = element<HTMLElement>('#command-risk')
const commandRiskText = element<HTMLElement>('#command-risk-text')
const commandRiskApprove = element<HTMLButtonElement>('#command-risk-approve')
const commandRiskCancel = element<HTMLButtonElement>('#command-risk-cancel')
const terminalNotice = element<HTMLElement>('#terminal-notice')
const terminalSearch = element<HTMLFormElement>('#terminal-search')
const terminalSearchInput = element<HTMLInputElement>('#terminal-search-input')
const commandBlocks = element<HTMLElement>('#command-blocks')
const powershellProfileButton = element<HTMLButtonElement>('#toggle-powershell-profile')
const showAuditButton = element<HTMLButtonElement>('#show-audit')
const auditLog = element<HTMLElement>('#audit-log')
const shellBehaviorStatus = element<HTMLElement>('#shell-behavior-status')
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
const commandCompletionButton = element<HTMLButtonElement>('#toggle-command-completion')
const historySuggestionsButton = element<HTMLButtonElement>('#toggle-history-suggestions')
const inputAssistStatus = element<HTMLElement>('#input-assist-status')
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
const previewBlock = element<HTMLElement>('#preview-block')
const previewTitle = element<HTMLElement>('#preview-title')
const previewBody = element<HTMLElement>('#preview-body')
const sshForm = element<HTMLFormElement>('#ssh-form')
const sshTargetInput = element<HTMLInputElement>('#ssh-target')
const directoryBrowser = element<HTMLElement>('#directory-browser')
const directoryBrowserPath = element<HTMLElement>('#directory-browser-path')
const directoryBrowserList = element<HTMLElement>('#directory-browser-list')
const contextRuntime = element<HTMLElement>('#context-runtime')
const contextDirectory = element<HTMLElement>('#context-directory')
const contextBranch = element<HTMLElement>('#context-branch')
const contextChanges = element<HTMLElement>('#context-changes')
const contextCommand = element<HTMLElement>('#context-command')
const contextPopover = element<HTMLElement>('#context-popover')
const contextPopoverSearch = element<HTMLInputElement>('#context-popover-search')
const contextPopoverList = element<HTMLElement>('#context-popover-list')
const newSessionMenu = element<HTMLElement>('#new-session-menu')
const sessionGroupInput = element<HTMLSelectElement>('#session-group')
const layoutStatus = element<HTMLElement>('#layout-status')

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
  commandCompletion: boolean
  historySuggestions: boolean
  loadPowerShellProfile: boolean
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
  settingsWidth: 320,
  commandCompletion: true,
  historySuggestions: true,
  loadPowerShellProfile: true
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
let historyCursor = -1
let copyResetTimer = 0
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
const searchAddon = new SearchAddon()
terminal.loadAddon(fitAddon)
terminal.loadAddon(searchAddon)
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
  inputMode: 'prompt' | 'running' | 'application'
  lastSubmitted: string
  commandArchiveOpen: boolean
  commandEntries: HTMLElement[]
  runningBlock: HTMLElement | null
  currentDirectory?: string
  remoteDirectory?: string
  groupId?: string
  nodeLabel?: string
  ssh?: SshTarget
  disposed: boolean
  reconnects: number
  reconnectTimer?: number
}

const uiSessions = new Map<string, UiSession>()
const sessionGroups: Array<StoredGroup & { collapsed: boolean }> = []
const groupColors = ['#73b7c8', '#6fbd9c', '#d78db5', '#d3a65f', '#8f83d8']
let activeSessionId = ''
let sessionSequence = 0
let editingGroupId = ''
let contextPopoverKind: 'node' | 'branch' | 'changes' | '' = ''
let latestGitDetails: GitDetails | null = null

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
  syncSessionGroupOptions()
  sessionGroupInput.value = session.groupId ?? ''
  showActiveDirectoryChip()
  for (const button of document.querySelectorAll<HTMLButtonElement>('#session-editor .color-options [data-color]')) {
    button.classList.toggle('is-selected', button.dataset.color === session.color)
  }
}

function createSessionCard(session: UiSession): HTMLElement {
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
  return card
}

function renderGroupEditor(group: StoredGroup): HTMLElement {
  const editor = document.createElement('form')
  editor.className = 'group-editor'
  editor.addEventListener('click', (event) => event.stopPropagation())
  editor.addEventListener('submit', (event) => event.preventDefault())
  const nameLabel = document.createElement('label')
  nameLabel.textContent = '分组名称'
  const nameInput = document.createElement('input')
  nameInput.maxLength = 30
  nameInput.value = group.name
  nameInput.addEventListener('input', () => {
    group.name = nameInput.value.trim().slice(0, 30) || '未命名分组'
    rememberSessions()
    const title = editor.parentElement?.querySelector('.group-header strong')
    if (title) title.textContent = group.name
  })
  const colorLabel = document.createElement('span')
  colorLabel.className = 'session-editor-label'
  colorLabel.textContent = '分组颜色'
  const colors = document.createElement('div')
  colors.className = 'color-options'
  for (const color of groupColors) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.dataset.color = color
    swatch.classList.toggle('is-selected', color === group.color)
    swatch.addEventListener('click', () => {
      group.color = color
      rememberSessions()
      renderSessionList()
    })
    colors.append(swatch)
  }
  const dissolve = document.createElement('button')
  dissolve.type = 'button'
  dissolve.textContent = '解散分组'
  dissolve.addEventListener('click', () => {
    for (const session of uiSessions.values()) {
      if (session.groupId === group.id) delete session.groupId
    }
    const index = sessionGroups.findIndex((item) => item.id === group.id)
    if (index >= 0) sessionGroups.splice(index, 1)
    editingGroupId = ''
    rememberSessions()
    renderSessionList()
  })
  editor.append(nameLabel, nameInput, colorLabel, colors, dissolve)
  return editor
}

function renderSessionList(): void {
  sessionList.replaceChildren()
  sessionCount.textContent = String(uiSessions.size)
  const grouped = new Set<string>()
  for (const group of sessionGroups) {
    const section = document.createElement('section')
    section.className = 'session-group'
    section.style.setProperty('--group-color', group.color)
    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'group-header'
    const swatch = document.createElement('i')
    swatch.className = 'group-swatch'
    const title = document.createElement('strong')
    title.textContent = group.name
    const count = document.createElement('span')
    const members = [...uiSessions.values()].filter((session) => session.groupId === group.id)
    count.textContent = String(members.length)
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'group-edit'
    edit.textContent = '编辑'
    edit.addEventListener('click', (event) => {
      event.stopPropagation()
      editingGroupId = editingGroupId === group.id ? '' : group.id
      renderSessionList()
    })
    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'group-add'
    add.dataset.sessionMenu = group.id
    add.textContent = '＋'
    add.title = '新建终端或分组'
    add.setAttribute('aria-label', '新建终端或分组')
    add.setAttribute('aria-expanded', 'false')
    add.addEventListener('click', (event) => {
      event.stopPropagation()
      openSessionMenu(add, group.id)
    })
    header.append(swatch, title, count)
    header.addEventListener('click', () => {
      group.collapsed = !group.collapsed
      renderSessionList()
    })
    const row = document.createElement('div')
    row.className = 'group-header-row'
    row.append(header, add, edit)
    section.append(row)
    if (editingGroupId === group.id) section.append(renderGroupEditor(group))
    if (!group.collapsed) {
      for (const session of members) {
        grouped.add(session.id)
        section.append(createSessionCard(session))
      }
    } else {
      for (const session of members) grouped.add(session.id)
    }
    sessionList.append(section)
  }
  for (const session of uiSessions.values()) {
    if (!grouped.has(session.id)) sessionList.append(createSessionCard(session))
  }
  syncSessionGroupOptions()
}

function switchSession(sessionId: string): void {
  const session = uiSessions.get(sessionId)
  if (!session || sessionId === activeSessionId) return
  activeSessionId = sessionId
  terminal.reset()
  if (session.output) terminal.write(session.output)
  refreshCompletions(session.inputBuffer)
  renderSessionCommandArchive()
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
  const existing = uiSessions.get(sessionId)
  if (existing) {
    existing.disposed = true
    if (existing.reconnectTimer) window.clearTimeout(existing.reconnectTimer)
  }
  if (!uiSessions.delete(sessionId)) return
  window.unixbridge.dispose(sessionId)
  rememberSessions()

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

function layoutWidth(): number {
  const shell = document.querySelector('.app-shell')
  const sidebar = document.querySelector('.sidebar')
  const total = shell instanceof HTMLElement ? shell.clientWidth : window.innerWidth
  const sidebarWidth = sidebar instanceof HTMLElement ? sidebar.getBoundingClientRect().width : 0
  return Math.max(0, total - sidebarWidth)
}

function fittedPanelWidths(showAi: boolean, showWidgets: boolean): { ai: number; widgets: number } {
  const settingsOpen = !settingsPopover.hidden
  const settings = settingsOpen ? appearance.settingsWidth + 4 : 0
  const aiGutter = showAi ? 4 : 0
  const widgetsOpen = showWidgets && !settingsOpen
  const widgetsGutter = widgetsOpen ? 4 : 0
  const ai = showAi ? appearance.aiWidth : 0
  const widgets = widgetsOpen ? appearance.widgetsWidth : 0
  const available = layoutWidth()
  if (available < 200) return { ai, widgets }
  const room = Math.max(0, available - settings - 320 - aiGutter - widgetsGutter)
  if (ai + widgets <= room) return { ai, widgets }
  if (widgets === 0) return { ai: Math.min(ai, room), widgets: 0 }
  const fittedAi = Math.min(ai, Math.max(0, room - Math.min(widgets, 220)))
  return { ai: fittedAi, widgets: Math.max(0, room - fittedAi) }
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
  const aiEnabled = appearance.panels.includes('ai')
  const widgetsEnabled =
    appearance.panels.includes('metrics') || appearance.panels.includes('files')
  const showAi = appearance.layout === 'assistant' || (appearance.layout === 'balanced' && aiEnabled)
  const showWidgets = appearance.layout === 'balanced' && widgetsEnabled
  const fitted = fittedPanelWidths(showAi, showWidgets)
  document.documentElement.style.setProperty('--ai-column', showAi ? `${fitted.ai}px` : '0px')
  document.documentElement.style.setProperty(
    '--widgets-column',
    showWidgets ? `${fitted.widgets}px` : '0px'
  )
  document.documentElement.style.setProperty('--ai-gutter', showAi ? '4px' : '0px')
  document.documentElement.style.setProperty('--widgets-gutter', showWidgets ? '4px' : '0px')
  aiWidthInput.value = String(appearance.aiWidth)
  widgetsWidthInput.value = String(appearance.widgetsWidth)
  aiWidthValue.value = `${appearance.aiWidth}px`
  widgetsWidthValue.value = `${appearance.widgetsWidth}px`
  fontSizeInput.value = String(appearance.fontSize)
  fontSizeValue.value = `${appearance.fontSize}px`
  fontFamilyInput.value = appearance.fontFamily
  settingsWidthInput.value = String(appearance.settingsWidth)
  settingsWidthValue.value = `${appearance.settingsWidth}px`
  commandCompletionButton.classList.toggle('is-selected', appearance.commandCompletion)
  commandCompletionButton.setAttribute('aria-pressed', String(appearance.commandCompletion))
  historySuggestionsButton.classList.toggle('is-selected', appearance.historySuggestions)
  historySuggestionsButton.setAttribute('aria-pressed', String(appearance.historySuggestions))
  powershellProfileButton.classList.toggle('is-selected', appearance.loadPowerShellProfile)
  powershellProfileButton.setAttribute('aria-pressed', String(appearance.loadPowerShellProfile))
  shellBehaviorStatus.textContent = appearance.loadPowerShellProfile
    ? 'Windows 启动时读取 PowerShell 配置。新的终端会话才会用到这项。'
    : 'Windows 启动时跳过 PowerShell 配置，启动更快，但没有你的别名和提示符。'
  inputAssistStatus.textContent =
    appearance.commandCompletion && appearance.historySuggestions
      ? '输入时显示常用命令补全和历史命令。'
      : appearance.commandCompletion
        ? '输入时只显示常用命令补全。'
        : appearance.historySuggestions
          ? '输入时只显示历史命令。'
          : '输入时不显示命令提示。'
  aiPanel.hidden = !showAi
  aiResizer.hidden = !showAi
  metricsWidget.hidden = !showWidgets || !appearance.panels.includes('metrics')
  filesWidget.hidden = !showWidgets || !appearance.panels.includes('files')
  widgetsPanel.hidden = !showWidgets
  widgetsResizer.hidden = widgetsPanel.hidden
  toggleAiButton.classList.toggle('is-active', showAi)
  toggleAiButton.setAttribute('aria-pressed', String(showAi))
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-module]')) {
    const module = button.dataset.module
    const active =
      module === 'terminal' ||
      (module === 'ai' && showAi) ||
      (module === 'metrics' && showWidgets && appearance.panels.includes('metrics')) ||
      (module === 'files' && showWidgets && appearance.panels.includes('files'))
    button.classList.toggle('is-active', active)
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
  layoutStatus.textContent =
    appearance.layout === 'terminal'
      ? '终端优先：AI 和右侧面板已收起，终端占满工作区。'
      : appearance.layout === 'assistant'
        ? 'AI 优先：AI 面板已展开，可拖拽分隔条或用下方宽度滑块调整。'
        : '均衡：按下方开关和宽度显示 AI 与右侧面板。'
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
    if (setting === 'layout') {
      appearance.layout = button.dataset.value as LayoutMode
      if (appearance.layout === 'assistant') {
        appearance.aiWidth = Math.max(appearance.aiWidth, 400)
        if (!appearance.panels.includes('ai')) appearance.panels = [...appearance.panels, 'ai']
      }
    }
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
    appearance.layout = 'balanced'
    appearance.panels = [...document.querySelectorAll<HTMLInputElement>(
      '[data-setting="panels"] input:checked'
    )].map((item) => item.value)
    saveAndApplyAppearance()
    if (appearance.panels.includes('metrics')) void refreshMetrics()
    if (appearance.panels.includes('files')) void loadFiles(currentFilePath)
  })
}

function togglePanel(panel: 'ai' | 'metrics' | 'files', force?: boolean): void {
  appearance.layout = 'balanced'
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
  if (appearance.layout === 'terminal') appearance.layout = 'assistant'
  if (!appearance.panels.includes('ai')) appearance.panels = [...appearance.panels, 'ai']
  saveAndApplyAppearance()
})
widgetsWidthInput.addEventListener('input', () => {
  appearance.layout = 'balanced'
  appearance.widgetsWidth = Number(widgetsWidthInput.value)
  if (!appearance.panels.includes('metrics') && !appearance.panels.includes('files')) {
    appearance.panels = [...appearance.panels, 'metrics', 'files']
  }
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
      const maxWidth = side === 'settings' ? 420 : Math.max(640, layoutWidth() - 360)
      const width = Math.max(minWidth, Math.min(maxWidth, Math.round(requested / 10) * 10))
      if (side === 'ai') {
        if (appearance.layout === 'terminal') appearance.layout = 'assistant'
        if (!appearance.panels.includes('ai')) appearance.panels = [...appearance.panels, 'ai']
        appearance.aiWidth = width
        aiWidthInput.value = String(width)
        aiWidthValue.value = `${width}px`
      } else if (side === 'widgets') {
        appearance.layout = 'balanced'
        if (!appearance.panels.includes('metrics') && !appearance.panels.includes('files')) {
          appearance.panels = [...appearance.panels, 'metrics', 'files']
        }
        appearance.widgetsWidth = width
        widgetsWidthInput.value = String(width)
        widgetsWidthValue.value = `${width}px`
      } else {
        appearance.settingsWidth = width
        settingsWidthInput.value = String(width)
        settingsWidthValue.value = `${width}px`
        document.documentElement.style.setProperty('--settings-column', `${width}px`)
      }
      saveAndApplyAppearance()
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
    const wideLimit = Math.max(640, layoutWidth() - 360)
    if (side === 'ai') {
      if (appearance.layout === 'terminal') appearance.layout = 'assistant'
      appearance.aiWidth = Math.max(200, Math.min(wideLimit, appearance.aiWidth + delta))
    } else if (side === 'widgets') {
      appearance.layout = 'balanced'
      appearance.widgetsWidth = Math.max(220, Math.min(wideLimit, appearance.widgetsWidth - delta))
    } else {
      appearance.settingsWidth = Math.max(280, Math.min(420, appearance.settingsWidth - delta))
    }
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
    const typedKey = aiApiKeyInput.value.trim()
    const saved = await window.unixbridge.configureAi({
      ...aiPreferences,
      ...(aiApiKeyInput.dataset.dirty === 'true' || typedKey ? { apiKey: typedKey } : {})
    })
    if (typedKey) {
      aiApiKeyInput.value = ''
      aiApiKeyInput.placeholder = saved.encryptionAvailable
        ? '已加密保存，留空则保持不变'
        : '本次运行有效，关闭后需要重新填写'
      delete aiApiKeyInput.dataset.dirty
    }
    aiConfigStatus.textContent = aiStatusText(saved, showSuccess)
  } catch (error) {
    aiConfigStatus.textContent = error instanceof Error ? error.message : String(error)
    throw error
  }
}

function aiStatusText(
  saved: { hasApiKey: boolean; encryptionAvailable: boolean; persisted: boolean },
  showSuccess: boolean
): string {
  if (saved.hasApiKey && !saved.encryptionAvailable) {
    return '当前环境无法加密密钥，它只留在本次运行的主进程内存中，关闭后需要重新填写'
  }
  if (showSuccess && saved.hasApiKey && saved.persisted) {
    return 'AI 配置已保存。密钥已加密保存在本机，界面不会回显。'
  }
  return showSuccess ? 'AI 配置已保存并可用' : 'AI 已就绪'
}

saveAiConfigButton.addEventListener('click', () => {
  void configureAi().catch(() => undefined)
})
aiApiKeyInput.addEventListener('input', () => {
  aiApiKeyInput.dataset.dirty = 'true'
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
          ? '拖到终端：本地会话切换目录，SSH 会话上传该文件夹'
          : '拖到 SSH 终端可上传该文件'
      const name = document.createElement('span')
      name.className = 'file-name'
      const label = document.createElement('span')
      label.textContent = item.name
      name.append(createFileIcon(classifyFile(item.name, item.type === 'directory' ? 'd' : '')), label)
      const size = document.createElement('span')
      size.textContent = item.type === 'directory' ? '目录' : formatBytes(item.size)
      row.append(name, size)
      row.addEventListener('click', () => {
        if (item.type === 'directory') {
          if (getActiveSession()) changeTerminalDirectory(item.path)
          else void loadFiles(item.path)
          return
        }
        void openPreview(item.path)
      })
      row.addEventListener('dragstart', (event) => {
        const targetDirectory = item.type === 'directory' ? item.path : listing.path
        draggedDirectory = targetDirectory
        draggedUploadPath = item.path
        row.classList.add('is-dragging')
        event.dataTransfer?.setData('application/x-unixbridge-directory', targetDirectory)
        event.dataTransfer?.setData('application/x-unixbridge-path', item.path)
        event.dataTransfer?.setData('text/plain', item.path)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
      })
      row.addEventListener('dragend', () => {
        draggedDirectory = undefined
        draggedUploadPath = undefined
        row.classList.remove('is-dragging')
        terminalRoot.classList.remove('is-directory-drop-target', 'is-ssh-upload')
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

function createFileIcon(kind: ReturnType<typeof classifyFile>): HTMLElement {
  const icon = document.createElement('span')
  icon.className = `file-kind is-${kind}`
  icon.title = fileKindLabel(kind)
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = fileKindMark(kind)
  return icon
}

function insertTerminalText(text: string): void {
  const session = getActiveSession()
  if (!session || !text) return
  session.inputBuffer += text
  window.unixbridge.write(session.id, text)
  terminal.focus()
}

function showDirectoryChip(directory: string, remote = false): void {
  const parts = directory.split(/[\\/]/).filter(Boolean)
  contextDirectory.textContent = parts.length > 0 ? `…/${parts.slice(-2).join('/')}` : directory
  contextDirectory.title = remote
    ? `远程当前目录：${directory}。拖到终端的文件会上传到这里。`
    : `查看文件夹：${directory}`
  if (remote) {
    contextDirectory.dataset.remote = '1'
    delete contextDirectory.dataset.path
    return
  }
  delete contextDirectory.dataset.remote
  contextDirectory.dataset.path = directory
}

function showActiveDirectoryChip(): void {
  const session = getActiveSession()
  if (!session) return
  if (session.ssh) {
    showDirectoryChip(session.remoteDirectory || '远程目录未知', true)
    return
  }
  if (session.currentDirectory) showDirectoryChip(session.currentDirectory)
  else delete contextDirectory.dataset.remote
}

function closeDirectoryBrowser(): void {
  directoryBrowser.hidden = true
  contextDirectory.classList.remove('is-open')
}

function placeDirectoryBrowser(): void {
  const host = terminalContext.parentElement?.getBoundingClientRect()
  const chip = contextDirectory.getBoundingClientRect()
  if (!host) return
  directoryBrowser.style.left = `${Math.max(8, chip.left - host.left)}px`
  directoryBrowser.style.top = `${chip.bottom - host.top + 6}px`
}

async function openDirectoryBrowser(path?: string): Promise<void> {
  directoryBrowser.hidden = false
  contextDirectory.classList.add('is-open')
  placeDirectoryBrowser()
  directoryBrowserList.textContent = '正在读取…'
  try {
    const listing = await window.unixbridge.listFiles(path)
    showDirectoryChip(listing.path)
    directoryBrowserPath.textContent = listing.path
    directoryBrowserList.replaceChildren()
    if (listing.parent) {
      const parent = listing.parent
      const up = document.createElement('button')
      up.type = 'button'
      up.className = 'directory-browser-row'
      up.textContent = '.. 上级目录'
      up.addEventListener('click', (event) => {
        event.stopPropagation()
        void openDirectoryBrowser(parent)
      })
      directoryBrowserList.append(up)
    }
    for (const item of listing.items) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'directory-browser-row'
      const label = document.createElement('span')
      label.textContent = item.name
      row.append(createFileIcon(classifyFile(item.name, item.type === 'directory' ? 'd' : '')), label)
      row.addEventListener('click', (event) => {
        event.stopPropagation()
        if (item.type === 'directory') {
          changeTerminalDirectory(item.path)
          void openDirectoryBrowser(item.path)
          return
        }
        void openPreview(item.path)
        closeDirectoryBrowser()
      })
      directoryBrowserList.append(row)
    }
  } catch (error) {
    directoryBrowserList.textContent = error instanceof Error ? error.message : String(error)
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? ''
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += character
      continue
    }
    if (character === '"') {
      quoted = true
      continue
    }
    if (character === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (character === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += character
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.slice(0, 200).map((record) => record.slice(0, 40))
}

function renderCsv(target: HTMLElement, text: string): void {
  const table = document.createElement('table')
  table.className = 'preview-table'
  for (const [index, record] of parseCsv(text).entries()) {
    const row = document.createElement('tr')
    for (const value of record) {
      const cell = document.createElement(index === 0 ? 'th' : 'td')
      cell.textContent = value
      row.append(cell)
    }
    table.append(row)
  }
  target.replaceChildren(table)
}

let previewPath = ''

async function openPreview(path: string): Promise<void> {
  previewPath = path
  previewTitle.textContent = path.split(/[/\\]/).pop() || path
  previewBody.textContent = '正在读取…'
  previewBlock.hidden = false
  relayoutTerminal()
  try {
    const preview = await window.unixbridge.previewFile(path)
    if (previewPath !== path && previewPath !== preview.path) return
    previewPath = preview.path
    previewTitle.textContent = preview.name
    previewBody.replaceChildren()
    if (preview.message) {
      previewBody.textContent = preview.message
      return
    }
    if (preview.kind === 'markdown' && preview.text !== undefined) {
      renderMarkdown(previewBody, preview.text)
      return
    }
    if (preview.kind === 'csv' && preview.text !== undefined) {
      renderCsv(previewBody, preview.text)
      return
    }
    if (preview.url && (preview.kind === 'image' || preview.kind === 'video' || preview.kind === 'pdf')) {
      const node = document.createElement(
        preview.kind === 'image' ? 'img' : preview.kind === 'video' ? 'video' : 'iframe'
      )
      if (node instanceof HTMLVideoElement) node.controls = true
      if (node instanceof HTMLIFrameElement) node.title = preview.name
      node.setAttribute('src', preview.url)
      previewBody.append(node)
      return
    }
    const pre = document.createElement('pre')
    pre.textContent = preview.text ?? ''
    previewBody.append(pre)
  } catch (error) {
    previewBody.textContent = error instanceof Error ? error.message : String(error)
  }
}

function closePreview(): void {
  previewBlock.hidden = true
  previewBody.replaceChildren()
  previewPath = ''
  relayoutTerminal()
}

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
  showDirectoryChip(path)
  void loadFiles(path)
  terminal.focus()
}

let draggedDirectory: string | undefined
let draggedUploadPath: string | undefined
let uploadInFlight = false

function isTerminalDropTarget(target: EventTarget | null): boolean {
  return target instanceof Node && terminalRoot.contains(target)
}

function externalFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  return [...types].includes('Files')
}

function clearTerminalDropState(): void {
  draggedDirectory = undefined
  draggedUploadPath = undefined
  terminalRoot.classList.remove('is-directory-drop-target', 'is-ssh-upload')
}

function pathsFromDrop(event: DragEvent): string[] {
  const custom = event.dataTransfer?.getData('application/x-unixbridge-path') || draggedUploadPath
  if (custom) return [custom]
  return [...(event.dataTransfer?.files ?? [])]
    .map((file) => window.unixbridge.pathForFile(file))
    .filter((item) => item.length > 0)
}

const removeUploadProgressListener = window.unixbridge.onUploadProgress((sessionId, message) => {
  if (sessionId === activeSessionId) showTerminalNotice(message)
})
async function uploadDroppedPaths(session: UiSession, paths: string[]): Promise<void> {
  if (!session.ssh || paths.length === 0 || uploadInFlight) return
  uploadInFlight = true
  const label = sshLabel(session.ssh)
  showTerminalNotice(`正在上传到 ${label}…`)
  try {
    const result = await window.unixbridge.uploadToSsh(session.id, paths)
    if (getActiveSession()?.id === session.id) showTerminalNotice(result.message)
  } catch (error) {
    if (getActiveSession()?.id === session.id) {
      showTerminalNotice(error instanceof Error ? error.message : String(error))
    }
  } finally {
    uploadInFlight = false
  }
}

document.addEventListener('dragover', (event) => {
  const internal = Boolean(draggedDirectory || draggedUploadPath)
  const external = externalFileDrag(event)
  const session = getActiveSession()
  if ((!internal && !(external && session?.ssh)) || !isTerminalDropTarget(event.target)) {
    terminalRoot.classList.remove('is-directory-drop-target', 'is-ssh-upload')
    return
  }
  event.preventDefault()
  terminalRoot.classList.add('is-directory-drop-target')
  terminalRoot.classList.toggle('is-ssh-upload', Boolean(session?.ssh))
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}, true)

document.addEventListener('drop', (event) => {
  if (!isTerminalDropTarget(event.target)) return
  const session = getActiveSession()
  const uploadPaths = pathsFromDrop(event)
  const directory =
    event.dataTransfer?.getData('application/x-unixbridge-directory') || draggedDirectory
  const sshDrop = Boolean(session?.ssh && uploadPaths.length > 0)
  if (!sshDrop && !directory && !externalFileDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  clearTerminalDropState()
  if (!sshDrop && !directory) return
  if (sshDrop && session) {
    void uploadDroppedPaths(session, uploadPaths)
    return
  }
  if (directory) changeTerminalDirectory(directory)
}, true)

const removeDataListener = window.unixbridge.onData((sessionId, data) => {
  const session = uiSessions.get(sessionId)
  if (!session) return
  session.output = `${session.output}${data}`.slice(-1_000_000)
  if (sessionId !== activeSessionId) return
  if (!isScreenClear(data)) {
    terminal.write(data)
    return
  }
  terminal.write(data, () => {
    terminal.scrollToLine(terminal.buffer.active.baseY)
    terminal.focus()
  })
})
const removeExitListener = window.unixbridge.onExit((sessionId, exitCode) => {
  const session = uiSessions.get(sessionId)
  if (!session || session.disposed) return
  const message = `\r\n\x1b[33m[unixbridge] 终端已退出，退出码 ${exitCode}\x1b[0m\r\n`
  session.output = `${session.output}${message}`.slice(-1_000_000)
  if (sessionId === activeSessionId) terminal.write(message)
  if (scheduleSshReconnect(session)) {
    renderSessionList()
    syncActiveSessionUi()
    return
  }
  session.statusText = `会话已退出 (${exitCode})`
  session.statusState = 'stopped'
  session.platformLabel = `已退出 · Code ${exitCode}`
  renderSessionList()
  syncActiveSessionUi()
})
const removeDirectoryListener = window.unixbridge.onDirectory((sessionId, directory) => {
  const session = uiSessions.get(sessionId)
  if (!session || (!session.ssh && session.currentDirectory === directory)) return
  if (session.ssh) {
    session.remoteDirectory = directory
    if (sessionId === activeSessionId) showDirectoryChip(directory, true)
    return
  }
  session.currentDirectory = directory
  if (sessionId !== activeSessionId) return
  workspaceSubtitle.textContent = directory
  showDirectoryChip(directory)
  void loadFiles(directory)
})
const removeModeListener = window.unixbridge.onMode((sessionId, mode, output) => {
  const session = uiSessions.get(sessionId)
  if (!session) return
  session.inputMode = mode
  if (mode === 'prompt') {
    if (output) rememberCommandOutput(session, output)
    finishCommandBlock(session)
    if (sessionId === activeSessionId) hideCompletions()
  }
})
const removeRiskListener = window.unixbridge.onRisk((sessionId, result) => {
  if (sessionId !== activeSessionId) return
  showCommandRisk(sessionId, result)
})
commandRiskApprove.addEventListener('click', () => {
  const sessionId = commandRisk.dataset.session ?? ''
  const token = commandRisk.dataset.token ?? ''
  const line = commandRisk.dataset.line ?? ''
  void window.unixbridge.approveCommand(sessionId, token).then((result) => {
    if (!result.approved) return
    const session = uiSessions.get(sessionId)
    if (session && line) {
      session.inputBuffer = ''
      recordCommand(line)
      void showWorkspaceContext(line)
    }
    hideCommandRisk()
    terminal.focus()
  })
})
commandRiskCancel.addEventListener('click', () => {
  const sessionId = commandRisk.dataset.session ?? ''
  const token = commandRisk.dataset.token ?? ''
  const session = uiSessions.get(sessionId)
  void window.unixbridge.cancelCommand(sessionId, token).then(() => {
    if (session) session.inputBuffer = ''
    hideCommandRisk()
    terminal.focus()
  })
})

function recordCommand(command: string): void {
  const normalized = command.trim()
  if (!normalized) return
  if (commandHistory[commandHistory.length - 1] !== normalized) commandHistory.push(normalized)
  if (commandHistory.length > 200) commandHistory.splice(0, commandHistory.length - 200)
  localStorage.setItem('unixbridge:command-history', JSON.stringify(commandHistory))
}

interface StructuredRequest {
  command: string
  args: string[]
  expanded: boolean
}

function structuredPlatform(platform: NodeJS.Platform | null): StructuredPlatform | undefined {
  if (platform === 'darwin') return 'mac'
  if (platform === 'linux') return 'linux'
  if (platform === 'win32') return 'windows'
  return undefined
}

function parseStructuredRequest(
  input: string,
  platform: NodeJS.Platform | null
): StructuredRequest | undefined {
  const structured = structuredPlatform(platform)
  if (!structured) return undefined
  const parsed = parseCommandLine(input)
  if (!parsed.ok || parsed.ast.kind !== 'command') return undefined
  const command = parsed.ast.name.toLowerCase()
  const args = [...parsed.ast.args]
  const expanded = args.at(-1) === '?'
  if (expanded) args.pop()
  if (!canStructure(command, args, structured)) return undefined
  return { command, args, expanded }
}

function fitTerminalAfterNotes(): void {
  requestAnimationFrame(() => {
    fitAddon.fit()
    resizeActiveTerminal()
  })
}

function setColumnNotesOpen(root: HTMLElement, open: boolean): void {
  const body = root.querySelector('.command-column-body')
  const toggle = root.querySelector('.command-column-toggle')
  if (body instanceof HTMLElement) body.hidden = !open
  if (toggle instanceof HTMLButtonElement) {
    toggle.setAttribute('aria-expanded', String(open))
    toggle.textContent = open ? '收起列说明' : '列说明'
  }
}

function attachColumnNotes(block: HTMLElement, columns: ColumnDef[], expanded: boolean): void {
  block.querySelector('.command-column-notes')?.remove()
  const root = document.createElement('div')
  root.className = 'command-column-notes'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'command-column-toggle'
  const body = document.createElement('div')
  body.className = 'command-column-body'
  for (const column of columns) {
    const item = document.createElement('p')
    const title = document.createElement('strong')
    title.textContent = `${column.header} (${column.key}) ${column.description}`
    item.append(title, document.createTextNode(`。${column.detailed ?? ''}`))
    body.append(item)
  }
  toggle.addEventListener('click', (event) => {
    event.stopPropagation()
    setColumnNotesOpen(root, toggle.getAttribute('aria-expanded') !== 'true')
    fitTerminalAfterNotes()
  })
  root.append(toggle, body)
  block.querySelector('header')?.after(root)
  setColumnNotesOpen(root, expanded)
}

function attachColumnError(block: HTMLElement, message: string): void {
  block.querySelector('.command-column-notes')?.remove()
  const note = document.createElement('p')
  note.className = 'command-column-error'
  note.textContent = message
  block.querySelector('header')?.after(note)
}

function latestColumnNotes(): HTMLElement | null {
  const entries = getActiveSession()?.commandEntries ?? []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const notes = entries[index]?.querySelector('.command-column-notes')
    if (notes instanceof HTMLElement) return notes
  }
  return null
}

function toggleLatestColumnNotes(): void {
  const notes = latestColumnNotes()
  if (!notes) return
  const toggle = notes.querySelector('.command-column-toggle')
  const open = !(toggle instanceof HTMLButtonElement && toggle.getAttribute('aria-expanded') === 'true')
  setColumnNotesOpen(notes, open)
  fitTerminalAfterNotes()
}

function relayoutTerminal(): void {
  requestAnimationFrame(() => {
    fitAddon.fit()
    resizeActiveTerminal()
    terminal.scrollToBottom()
  })
}

async function showStructuredMetadata(
  session: UiSession,
  rawInput: string,
  request: StructuredRequest
): Promise<void> {
  const block = session.runningBlock
  recordCommand(rawInput)
  void showWorkspaceContext(
    request.args.length > 0 ? `${request.command} ${request.args.join(' ')}` : request.command,
    false
  )
  try {
    const result = await window.unixbridge.structuredCommand(
      request.command,
      request.args,
      session.currentDirectory ?? currentFilePath
    )
    if (!block || result.columns.length === 0) return
    attachColumnNotes(block, result.columns, request.expanded)
    if (session.id === activeSessionId) relayoutTerminal()
  } catch (error) {
    if (!block) return
    attachColumnError(block, error instanceof Error ? error.message : String(error))
    if (session.id === activeSessionId) relayoutTerminal()
  }
}

function isClearCommand(command: string): boolean {
  return /^(?:clear|reset)(?:\s|$)/.test(command.trim())
}

function isScreenClear(data: string): boolean {
  return /\u001b(?:\[(?:\d+;)*(?:2|3)J|c)/.test(data)
}

function revealPrompt(): void {
  requestAnimationFrame(() => {
    fitAddon.fit()
    resizeActiveTerminal()
    terminal.scrollToBottom()
    terminal.focus()
  })
}

async function showWorkspaceContext(command: string, relayout = true): Promise<void> {
  try {
    const session = getActiveSession()
    const context = await window.unixbridge.workspaceContext(session?.currentDirectory)
    contextRuntime.textContent = session?.nodeLabel || context.runtime
    if (session?.ssh) showDirectoryChip(session.remoteDirectory || '远程目录未知', true)
    else showDirectoryChip(session?.currentDirectory || context.directory)
    contextBranch.textContent = context.branch ?? '无 Git 分支'
    contextBranch.dataset.branch = context.branch ?? ''
    contextChanges.textContent = formatChangeChip(context.changes, context.insertions, context.deletions)
    contextCommand.textContent = command
    const becameVisible = terminalContext.hidden
    terminalContext.hidden = false
    if (isClearCommand(command)) {
      requestAnimationFrame(() => {
        fitAddon.fit()
        resizeActiveTerminal()
        terminal.focus()
      })
      return
    }
    if (!relayout || !becameVisible) return
    revealPrompt()
  } catch {
    const becameHidden = !terminalContext.hidden
    terminalContext.hidden = true
    if (!relayout || !becameHidden) return
    requestAnimationFrame(() => {
      fitAddon.fit()
      resizeActiveTerminal()
    })
  }
}

let completionItems: CommandSuggestion[] = []
let completionIndex = 0

function hideCompletions(): void {
  completionItems = []
  completionIndex = 0
  commandComplete.hidden = true
  commandComplete.replaceChildren()
}

function renderCompletions(): void {
  commandComplete.replaceChildren()
  completionItems.forEach((item, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.classList.toggle('is-active', index === completionIndex)
    const command = document.createElement('strong')
    command.textContent = item.command
    const description = document.createElement('span')
    description.textContent = item.description
    button.append(command, description)
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      acceptCompletion(item.command)
    })
    commandComplete.append(button)
  })
  commandComplete.hidden = completionItems.length === 0
  commandComplete.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
}

let pathCompletionTicket = 0

function refreshCompletions(input: string): void {
  completionItems = suggestCommands(input, commandHistory, {
    commands: appearance.commandCompletion,
    history: appearance.historySuggestions
  })
  completionIndex = 0
  renderCompletions()
  void refreshPathCompletions(input)
}

async function refreshPathCompletions(input: string): Promise<void> {
  const ticket = ++pathCompletionTicket
  const session = getActiveSession()
  const query = appearance.commandCompletion && session && !session.ssh ? pathCompletionQuery(input) : undefined
  if (!session || !query) return
  const cwd = session.currentDirectory || currentFilePath
  if (!cwd) return
  try {
    const listing = await window.unixbridge.listFiles(joinCompletionDirectory(cwd, query.parent))
    if (ticket !== pathCompletionTicket || getActiveSession()?.inputBuffer !== input) return
    const prefix = query.prefix.toLocaleLowerCase()
    const files = listing.items
      .filter((item) => item.name.toLocaleLowerCase().startsWith(prefix))
      .sort((left, right) => {
        if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
        return left.name.localeCompare(right.name)
      })
      .slice(0, 6)
      .map((item) => ({
        command: completePathToken(
          input,
          item.name,
          item.type === 'directory' ? 'directory' : 'file',
          session.platform === 'win32' ? 'win32' : 'posix'
        ),
        description: item.type === 'directory' ? '目录' : '文件'
      }))
    if (files.length === 0) return
    const seen = new Set(completionItems.map((item) => item.command))
    completionItems = [...completionItems, ...files.filter((item) => !seen.has(item.command))].slice(0, 8)
    renderCompletions()
  } catch {
    // 当前目录超出用户主目录时不提供路径补全。
  }
}

function toggleInputAssist(kind: 'commandCompletion' | 'historySuggestions'): void {
  appearance[kind] = !appearance[kind]
  saveAndApplyAppearance()
  const session = getActiveSession()
  if (session) refreshCompletions(session.inputBuffer)
  else hideCompletions()
}

commandCompletionButton.addEventListener('click', () => toggleInputAssist('commandCompletion'))
historySuggestionsButton.addEventListener('click', () => toggleInputAssist('historySuggestions'))
powershellProfileButton.addEventListener('click', () => {
  appearance.loadPowerShellProfile = !appearance.loadPowerShellProfile
  saveAndApplyAppearance()
})

function showTerminalNotice(message: string): void {
  terminalNotice.hidden = message.length === 0
  terminalNotice.textContent = message
}

function hideCommandRisk(): void {
  commandRisk.hidden = true
  delete commandRisk.dataset.session
  delete commandRisk.dataset.token
  delete commandRisk.dataset.line
  commandRiskText.textContent = ''
  commandRiskApprove.hidden = false
}

function replacePromptLine(session: UiSession, command: string): void {
  void window.unixbridge.write(session.id, `\u0001\u000b${command}`)
  session.inputBuffer = command
  refreshCompletions(command)
}

function renderSessionCommandArchive(): void {
  const session = getActiveSession()
  commandBlocks.replaceChildren()
  if (!session || session.commandEntries.length === 0) {
    commandBlocks.hidden = true
    commandBlocks.classList.remove('is-open')
    return
  }
  commandBlocks.hidden = false
  commandBlocks.classList.toggle('is-open', session.commandArchiveOpen)
  const older = session.commandEntries.length - 1
  if (older > 0) {
    const bar = document.createElement('div')
    bar.className = 'command-archive-bar'
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.textContent = session.commandArchiveOpen ? '收起更早的命令' : `更早的 ${older} 条`
    toggle.addEventListener('click', () => {
      session.commandArchiveOpen = !session.commandArchiveOpen
      renderSessionCommandArchive()
      requestAnimationFrame(() => {
        fitAddon.fit()
        resizeActiveTerminal()
      })
    })
    bar.append(toggle)
    commandBlocks.append(bar)
  }
  commandBlocks.append(...session.commandEntries)
}

function beginCommandBlock(session: UiSession, command: string): void {
  if (!command) return
  finishCommandBlock(session)
  const block = document.createElement('article')
  block.className = 'command-block is-active'
  const header = document.createElement('header')
  const title = document.createElement('strong')
  title.textContent = command
  const actions = document.createElement('div')
  actions.className = 'command-block-actions'
  const time = document.createElement('span')
  time.className = 'command-block-time'
  time.textContent = '运行中'
  const meta = document.createElement('div')
  meta.className = 'command-block-meta'
  actions.append(time)
  header.append(title, actions)
  block.dataset.started = String(Date.now())
  block.append(header, meta)
  session.commandEntries.push(block)
  while (session.commandEntries.length > 20) session.commandEntries.shift()
  session.runningBlock = block
  if (session.id === activeSessionId) renderSessionCommandArchive()
}

function copyCommandText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => copyCommandTextFallback(text)
    )
  }
  return Promise.resolve(copyCommandTextFallback(text))
}

function copyCommandTextFallback(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  document.body.append(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  return copied
}

function rememberCommandOutput(session: UiSession, text: string): void {
  const block = session.runningBlock
  if (!block || !text) return
  let output = block.querySelector('.command-block-output')
  if (!(output instanceof HTMLElement)) {
    output = document.createElement('pre')
    output.className = 'command-block-output'
    block.append(output)
  }
  output.textContent = text
  block.querySelector('.command-problem-toggle')?.remove()
  block.querySelector('.command-block-note')?.remove()
  const problem = explainCommandProblem(text)
  if (problem) {
    const note = document.createElement('p')
    note.className = 'command-block-note'
    note.hidden = true
    note.textContent = problem
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'command-problem-toggle'
    toggle.textContent = '错误说明'
    toggle.addEventListener('click', () => {
      note.hidden = !note.hidden
      toggle.textContent = note.hidden ? '错误说明' : '收起说明'
      requestAnimationFrame(() => {
        fitAddon.fit()
        resizeActiveTerminal()
      })
    })
    block.querySelector('.command-block-actions')?.append(toggle)
    block.querySelector('header')?.after(note)
  }
  block.classList.add('is-collapsed')
  if (block.querySelector('.command-output-toggle')) return
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'command-output-toggle'
  toggle.textContent = '展开'
  toggle.addEventListener('click', () => {
    const collapsed = block.classList.toggle('is-collapsed')
    toggle.textContent = collapsed ? '展开' : '收起'
    requestAnimationFrame(() => {
      fitAddon.fit()
      resizeActiveTerminal()
    })
  })
  block.querySelector('.command-block-actions')?.append(toggle)
}

function attachFinishedActions(session: UiSession, block: HTMLElement): void {
  if (block.querySelector('.command-copy')) return
  const command = block.querySelector('header strong')?.textContent ?? ''
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.className = 'command-copy'
  copy.textContent = '复制'
  copy.addEventListener('click', () => {
    const body = block.querySelector('.command-block-output')?.textContent?.trim() ?? ''
    void copyCommandText(body ? `${command}\n${body}` : command).then((copied) => {
      if (!copied) return
      copy.textContent = '已复制'
      window.clearTimeout(copyResetTimer)
      copyResetTimer = window.setTimeout(() => {
        copy.textContent = '复制'
      }, 1200)
    })
  })
  const rerun = document.createElement('button')
  rerun.type = 'button'
  rerun.textContent = '重跑'
  rerun.addEventListener('click', () => {
    if (session.inputMode !== 'prompt' || session.id !== activeSessionId) {
      showTerminalNotice('只能在当前会话的提示符下重跑')
      return
    }
    replacePromptLine(session, command)
    void submitTerminalLine(session, '\r')
  })
  block.querySelector('.command-block-time')?.after(copy, rerun)
}

function finishCommandBlock(session: UiSession): void {
  const block = session.runningBlock
  if (!block) return
  attachFinishedActions(session, block)
  block.classList.remove('is-active')
  const time = block.querySelector('.command-block-time')
  if (time && time.textContent === '运行中') {
    const started = Number(block.dataset.started)
    const elapsed = Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0
    time.textContent = elapsed >= 1000 ? `已结束 · ${(elapsed / 1000).toFixed(1)}s` : `已结束 · ${elapsed}ms`
  }
  session.runningBlock = null
  if (session.id === activeSessionId) renderSessionCommandArchive()
}

function showCommandRisk(sessionId: string, result: PtyWriteResult): void {
  if (result.action === 'warn') {
    showTerminalNotice(result.reason)
    return
  }
  if (result.action !== 'confirm' && result.action !== 'deny') {
    hideCommandRisk()
    return
  }
  commandRisk.hidden = false
  commandRisk.dataset.session = sessionId
  if (result.token) commandRisk.dataset.token = result.token
  else delete commandRisk.dataset.token
  commandRisk.dataset.line = result.line
  commandRiskText.textContent = result.action === 'deny' ? `已拒绝：${result.reason}` : result.reason
  commandRiskApprove.hidden = result.action !== 'confirm'
}

async function submitTerminalLine(session: UiSession, data: string): Promise<void> {
  const submittedCommand = session.inputBuffer.trim()
  const structured = submittedCommand
    ? parseStructuredRequest(submittedCommand, session.platform)
    : undefined
  let outbound = data
  if (structured?.expanded) outbound = `\u007f${data}`
  const translated =
    session.platform === 'win32' && submittedCommand ? translate(submittedCommand, 'windows') : undefined
  if (translated?.changed) {
    outbound = `${'\u007f'.repeat(session.inputBuffer.length)}${translated.shellLine}\r`
    showTerminalNotice(translated.notice)
  }
  if (submittedCommand) finishCommandBlock(session)
  const result = await window.unixbridge.write(session.id, outbound)
  if (result.action === 'deny') {
    session.inputBuffer = ''
    hideCompletions()
    return
  }
  if (result.action === 'confirm') {
    hideCompletions()
    return
  }
  if (!translated?.changed && result.action !== 'warn') showTerminalNotice('')
  const command = result.line || submittedCommand
  session.inputBuffer = ''
  session.inputMode = 'running'
  session.lastSubmitted = command
  historyCursor = -1
  if (command) {
    recordCommand(command)
    beginCommandBlock(session, command)
    void showWorkspaceContext(command)
  }
  hideCompletions()
  if (structured) void showStructuredMetadata(session, command, structured)
}

function acceptCompletion(command: string): void {
  const session = getActiveSession()
  if (!session || session.inputMode !== 'prompt') return
  replacePromptLine(session, command)
  if (!/[\\/]['"]?$/.test(command)) hideCompletions()
  terminal.focus()
}

terminal.onData((data) => {
  const session = getActiveSession()
  if (!session) return
  if (data === '\u0007' && latestColumnNotes()) {
    toggleLatestColumnNotes()
    return
  }
  if (session.inputMode === 'prompt' && (data === '\u001b[A' || data === '\u001b[B') && completionItems.length > 0) {
    completionIndex =
      data === '\u001b[A'
        ? (completionIndex - 1 + completionItems.length) % completionItems.length
        : (completionIndex + 1) % completionItems.length
    renderCompletions()
    return
  }
  if (session.inputMode === 'prompt' && (data === '\u001b[A' || data === '\u001b[B') && completionItems.length === 0) {
    const next = data === '\u001b[A'
      ? (historyCursor < 0 ? commandHistory.length - 1 : Math.max(0, historyCursor - 1))
      : historyCursor + 1
    historyCursor = next >= commandHistory.length ? -1 : next
    replacePromptLine(session, historyCursor < 0 ? '' : commandHistory[historyCursor] ?? '')
    return
  }
  if (data === '\u001b' && completionItems.length > 0) {
    hideCompletions()
    return
  }
  if (session.inputMode === 'prompt' && data === '\t') {
    if (completionItems.length === 0) refreshCompletions(session.inputBuffer)
    const chosen = completionItems[completionIndex]
    if (chosen) {
      acceptCompletion(chosen.command)
      return
    }
  }

  if (data === '\r' || data === '\n') {
    if (session.inputMode === 'running') {
      finishCommandBlock(session)
      void window.unixbridge.write(session.id, data).then((result) => {
        if (!result.line || (result.action !== 'allow' && result.action !== 'warn')) return
        session.lastSubmitted = result.line
        recordCommand(result.line)
        beginCommandBlock(session, result.line)
        void showWorkspaceContext(result.line)
        const structured = parseStructuredRequest(result.line, session.platform)
        if (structured) void showStructuredMetadata(session, result.line, structured)
      })
      return
    }
    if (session.inputMode !== 'prompt') {
      void window.unixbridge.write(session.id, data)
      return
    }
    void submitTerminalLine(session, data)
    return
  }
  hideCommandRisk()
  void window.unixbridge.write(session.id, data)
  if (session.inputMode === 'application' || data.startsWith('\u001b')) return
  if (session.inputMode === 'running') {
    for (const character of data) {
      if (character === '\u007f' || character === '\b') session.inputBuffer = session.inputBuffer.slice(0, -1)
      else if (character === '\u0003') session.inputBuffer = ''
      else if (character >= ' ') session.inputBuffer += character
    }
    return
  }
  historyCursor = -1
  for (const character of data) {
    if (character === '\u007f') session.inputBuffer = session.inputBuffer.slice(0, -1)
    else if (character === '\u0003') session.inputBuffer = ''
    else if (character >= ' ') session.inputBuffer += character
  }
  if (data === '\u0003') hideCompletions()
  else refreshCompletions(session.inputBuffer)
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
window.addEventListener('resize', () => {
  saveAndApplyAppearance()
  requestAnimationFrame(() => saveAndApplyAppearance())
})

function scheduleSshReconnect(session: UiSession): boolean {
  if (!session.ssh || session.disposed || session.reconnects >= 6) return false
  session.reconnects += 1
  const delay = Math.min(15_000, 1000 * 2 ** (session.reconnects - 1))
  session.statusText = `SSH 断开，${Math.round(delay / 1000)} 秒后重连`
  session.statusState = 'stopped'
  session.platformLabel = session.statusText
  if (session.reconnectTimer) window.clearTimeout(session.reconnectTimer)
  session.reconnectTimer = window.setTimeout(() => {
    void connectSession(session, true)
  }, delay)
  return true
}

function sshLabel(target: SshTarget): string {
  return `ssh ${target.user ? `${target.user}@` : ''}${target.host}`
}

function syncSessionGroupOptions(): void {
  const selected = sessionGroupInput.value
  sessionGroupInput.replaceChildren()
  const empty = document.createElement('option')
  empty.value = ''
  empty.textContent = '未分组'
  sessionGroupInput.append(empty)
  for (const group of sessionGroups) {
    const option = document.createElement('option')
    option.value = group.id
    option.textContent = group.name
    sessionGroupInput.append(option)
  }
  sessionGroupInput.value = sessionGroups.some((group) => group.id === selected) ? selected : ''
}

function persistedWorkspace(): {
  sessions: Array<{
    id: string
    name: string
    color: string
    kind: 'local' | 'ssh'
    ssh?: SshTarget
    groupId?: string
  }>
  groups: StoredGroup[]
} {
  return {
    sessions: [...uiSessions.values()].map((session) => ({
      id: session.id,
      name: session.name,
      color: session.color,
      kind: session.ssh ? 'ssh' as const : 'local' as const,
      ...(session.ssh ? { ssh: session.ssh } : {}),
      ...(session.groupId ? { groupId: session.groupId } : {})
    })),
    groups: sessionGroups.map((group) => ({ id: group.id, name: group.name, color: group.color }))
  }
}

function rememberSessions(): void {
  void window.unixbridge.saveSessions(persistedWorkspace()).catch(() => undefined)
}

function setConnectionState(
  session: UiSession,
  platform: NodeJS.Platform,
  pid: number,
  shell: string
): void {
  session.platform = platform
  const label = session.ssh ? sshLabel(session.ssh) : platform === 'win32' ? `${shell} · ConPTY` : shell
  session.statusText = `${label} · PID ${pid}`
  session.statusState = 'running'
  session.platformLabel = `${label} · PID ${pid}`
  renderSessionList()
  if (session.id === activeSessionId) syncActiveSessionUi()
}

async function connectSession(session: UiSession, reconnect = false): Promise<void> {
  if (session.disposed) return
  session.statusText = session.ssh ? (reconnect ? '正在重连 SSH…' : '正在连接 SSH…') : '正在启动终端…'
  session.statusState = ''
  session.platformLabel = session.statusText
  renderSessionList()
  if (session.id === activeSessionId) syncActiveSessionUi()
  try {
    fitAddon.fit()
    const started = await window.unixbridge.start(
      session.id,
      terminal.cols,
      terminal.rows,
      session.ssh,
      appearance.loadPowerShellProfile
    )
    if (session.disposed) return
    session.reconnects = 0
    setConnectionState(session, started.platform, started.pid, started.shell)
    if (session.id === activeSessionId) terminal.focus()
    rememberSessions()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const output = `\x1b[31m[unixbridge] ${message}\x1b[0m\r\n`
    session.statusText = '启动失败'
    session.statusState = 'stopped'
    session.platformLabel = '连接失败'
    session.output = `${session.output}${output}`.slice(-1_000_000)
    if (scheduleSshReconnect(session)) {
      renderSessionList()
      if (session.id === activeSessionId) syncActiveSessionUi()
      return
    }
    renderSessionList()
    if (session.id === activeSessionId) {
      syncActiveSessionUi()
      terminal.write(output)
    }
  }
}

async function startSession(options?: {
  ssh?: SshTarget
  id?: string
  name?: string
  color?: string
  groupId?: string
}): Promise<void> {
  sessionSequence += 1
  const sessionId =
    options?.id ??
    window.crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${sessionSequence}`
  const ssh = options?.ssh
  const session: UiSession = {
    id: sessionId,
    name:
      options?.name ??
      (ssh ? sshLabel(ssh) : sessionSequence === 1 ? appearance.sessionName : `终端 ${sessionSequence}`),
    color: options?.color ?? appearance.sessionColor,
    platform: null,
    platformLabel: '正在连接…',
    statusText: ssh ? '正在连接 SSH…' : '正在启动终端…',
    statusState: '',
    output: '',
    inputBuffer: '',
    inputMode: 'prompt',
    lastSubmitted: '',
    commandArchiveOpen: false,
    commandEntries: [],
    runningBlock: null,
    disposed: false,
    reconnects: 0,
    ...(ssh ? { ssh } : {}),
    ...(options?.groupId ? { groupId: options.groupId } : {})
  }
  uiSessions.set(sessionId, session)
  activeSessionId = sessionId
  terminal.reset()
  renderSessionCommandArchive()
  commandSearch.value = ''
  filterCommands('')
  setSessionEditorOpen(false)
  renderSessionList()
  syncActiveSessionUi()
  await connectSession(session)
}

async function restoreSessions(): Promise<void> {
  const stored = await window.unixbridge.loadSessions().catch(() => ({ sessions: [], groups: [] }))
  sessionGroups.splice(
    0,
    sessionGroups.length,
    ...stored.groups.map((group) => ({ ...group, collapsed: false }))
  )
  if (stored.sessions.length === 0) {
    await startSession()
    return
  }
  for (const item of stored.sessions) {
    await startSession({
      id: item.id,
      name: item.name,
      color: item.color,
      ...(item.ssh ? { ssh: item.ssh } : {}),
      ...(item.groupId ? { groupId: item.groupId } : {})
    })
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

function closeContextPopover(): void {
  contextPopover.hidden = true
  contextPopoverKind = ''
  contextPopoverSearch.hidden = true
  for (const chip of [contextRuntime, contextBranch, contextChanges]) {
    chip.classList.remove('is-open')
  }
}

let sessionMenuGroupId = ''

function closeNewSessionMenu(): void {
  newSessionMenu.hidden = true
  delete newSessionMenu.dataset.anchor
  sessionMenuGroupId = ''
  newSessionMenu.style.position = ''
  newSessionMenu.style.top = ''
  newSessionMenu.style.left = ''
  newSessionMenu.style.right = ''
  element<HTMLButtonElement>('#new-session').setAttribute('aria-expanded', 'false')
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-session-menu]')) {
    button.setAttribute('aria-expanded', 'false')
  }
}

function openSessionMenu(anchor: HTMLElement, groupId = ''): void {
  const anchorId = anchor.dataset.sessionMenu || anchor.id
  if (!newSessionMenu.hidden && newSessionMenu.dataset.anchor === anchorId) {
    closeNewSessionMenu()
    return
  }
  closeContextPopover()
  closeDirectoryBrowser()
  closeNewSessionMenu()
  sessionMenuGroupId = groupId
  const rect = anchor.getBoundingClientRect()
  newSessionMenu.hidden = false
  newSessionMenu.dataset.anchor = anchorId
  newSessionMenu.style.position = 'fixed'
  newSessionMenu.style.top = `${rect.bottom + 6}px`
  newSessionMenu.style.right = 'auto'
  newSessionMenu.style.left = `${Math.min(window.innerWidth - 176, Math.max(8, rect.right - 168))}px`
  anchor.setAttribute('aria-expanded', 'true')
}

function placeContextPopover(anchor: HTMLElement): void {
  const host = terminalContext.parentElement?.getBoundingClientRect()
  const chip = anchor.getBoundingClientRect()
  if (!host) return
  contextPopover.style.left = `${Math.max(8, chip.left - host.left)}px`
  contextPopover.style.top = `${chip.bottom - host.top + 6}px`
}

function showContextMessage(message: string): void {
  contextPopoverList.replaceChildren()
  const empty = document.createElement('div')
  empty.className = 'context-empty'
  empty.textContent = message
  contextPopoverList.append(empty)
}

function writeShellLine(command: string): void {
  const session = getActiveSession()
  if (!session) return
  session.inputBuffer = ''
  window.unixbridge.write(session.id, `${command}\r`)
  closeContextPopover()
  terminal.focus()
}

function openContextPopover(kind: 'node' | 'branch' | 'changes', anchor: HTMLElement): void {
  const opening = contextPopover.hidden || contextPopoverKind !== kind
  closeDirectoryBrowser()
  closeNewSessionMenu()
  if (!opening) {
    closeContextPopover()
    return
  }
  contextPopoverKind = kind
  contextPopover.hidden = false
  contextPopoverSearch.hidden = kind !== 'branch'
  contextPopoverSearch.value = ''
  for (const chip of [contextRuntime, contextBranch, contextChanges]) {
    chip.classList.toggle('is-open', chip === anchor)
  }
  placeContextPopover(anchor)
  showContextMessage('正在读取…')
  if (kind === 'node') void showNodeRuntimes()
  else void showGitDetails(kind)
}

async function showNodeRuntimes(): Promise<void> {
  const session = getActiveSession()
  if (session?.ssh) {
    showContextMessage('SSH 会话请在远端终端里切换 Node。')
    return
  }
  const runtimes = await window.unixbridge.nodeRuntimes().catch(() => [])
  contextPopoverList.replaceChildren()
  if (runtimes.length === 0) {
    showContextMessage('没有找到已安装的 Node 版本。')
    return
  }
  for (const runtime of runtimes) contextPopoverList.append(nodeRuntimeButton(runtime))
}

function nodeRuntimeButton(runtime: NodeRuntime): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.classList.toggle('is-current', runtime.current)
  const version = document.createElement('strong')
  version.textContent = `v${runtime.version}`
  const source = document.createElement('small')
  source.textContent = runtime.current ? `${runtime.source} · 当前` : runtime.source
  button.append(version, source)
  button.addEventListener('click', () => {
    const session = getActiveSession()
    if (!session || !runtime.binDir || runtime.binDir.includes('\n') || runtime.binDir.includes('\0')) {
      closeContextPopover()
      return
    }
    session.nodeLabel = `Node v${runtime.version}`
    contextRuntime.textContent = session.nodeLabel
    const pathCommand =
      session.platform === 'win32'
        ? `$env:Path = ${shellQuote(runtime.binDir)} + ';' + $env:Path; Write-Output ("Now using node " + (node -v) + " (npm " + (npm -v) + ")")`
        : `export PATH=${shellQuote(runtime.binDir)}:"$PATH" && hash -r && printf 'Now using node %s (npm %s)\\n' "$(node -v 2>/dev/null)" "$(npm -v 2>/dev/null || printf unknown)"`
    writeShellLine(pathCommand)
  })
  return button
}

async function showGitDetails(kind: 'branch' | 'changes'): Promise<void> {
  const session = getActiveSession()
  if (session?.ssh) {
    showContextMessage('SSH 会话请在远端终端里查看 Git。')
    return
  }
  const directory = session?.currentDirectory || contextDirectory.dataset.path
  const details = await window.unixbridge.workspaceGit(directory).catch(() => null)
  latestGitDetails = details
  if (!details || (!details.branch && details.branches.length === 0 && details.files.length === 0)) {
    showContextMessage('当前目录不是 Git 仓库。')
    return
  }
  if (kind === 'branch') renderBranchChoices(details)
  else renderChangeChoices(details)
}

function renderBranchChoices(details: GitDetails): void {
  const query = contextPopoverSearch.value.trim().toLowerCase()
  const branches = details.branches.filter((branch) => branch.toLowerCase().includes(query))
  contextPopoverList.replaceChildren()
  if (branches.length === 0) {
    showContextMessage('没有匹配的分支。')
    return
  }
  for (const branch of branches) {
    const button = document.createElement('button')
    button.type = 'button'
    button.classList.toggle('is-current', branch === details.branch)
    button.textContent = branch
    button.addEventListener('click', () => {
      if (!isSafeBranchName(branch) || branch === details.branch) {
        closeContextPopover()
        return
      }
      writeShellLine(`git switch -- ${shellQuote(branch)}`)
    })
    contextPopoverList.append(button)
  }
}

function renderChangeChoices(details: GitDetails): void {
  contextPopoverList.replaceChildren()
  if (details.files.length === 0) {
    showContextMessage('工作区没有未提交的改动。')
    return
  }
  for (const file of details.files) {
    const button = document.createElement('button')
    button.type = 'button'
    const status = document.createElement('small')
    status.textContent = file.status
    const name = document.createElement('span')
    name.textContent = file.path
    button.append(status, name)
    button.addEventListener('click', () => {
      const separator = details.directory.includes('\\') ? '\\' : '/'
      const fullPath = `${details.directory.replace(/[\\/]$/, '')}${separator}${file.path}`
      closeContextPopover()
      void openPreview(fullPath)
    })
    contextPopoverList.append(button)
  }
}

function createSessionGroup(): void {
  const rawId = window.crypto.randomUUID?.() ?? `group${Date.now()}`
  const id = rawId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
  const groupId = id.length >= 8 ? id : `group${Date.now()}`
  const color = groupColors[sessionGroups.length % groupColors.length] ?? '#8f83d8'
  sessionGroups.push({
    id: groupId,
    name: `分组 ${sessionGroups.length + 1}`,
    color,
    collapsed: false
  })
  const active = getActiveSession()
  if (active && !active.groupId) {
    active.groupId = groupId
    active.color = color
    syncActiveSessionUi()
  }
  editingGroupId = groupId
  closeNewSessionMenu()
  rememberSessions()
  renderSessionList()
}

element<HTMLButtonElement>('#new-session').addEventListener('click', (event) => {
  event.stopPropagation()
  openSessionMenu(element<HTMLButtonElement>('#new-session'))
})
element<HTMLButtonElement>('#create-terminal').addEventListener('click', () => {
  const groupId = sessionMenuGroupId
  closeNewSessionMenu()
  const active = getActiveSession()
  const group = sessionGroups.find((item) => item.id === (groupId || active?.groupId || editingGroupId))
  void startSession({
    ...(group ? { groupId: group.id, color: group.color } : {})
  })
})
element<HTMLButtonElement>('#create-group').addEventListener('click', (event) => {
  event.stopPropagation()
  createSessionGroup()
})
newSessionMenu.addEventListener('click', (event) => event.stopPropagation())
element<HTMLElement>('#clear-terminal').addEventListener('click', () => {
  const session = getActiveSession()
  if (!session) return
  window.unixbridge.write(session.id, 'clear\r')
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
  rememberSessions()
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
    rememberSessions()
  })
}
document.addEventListener('click', () => {
  if (settingsResizeClickPending) return
  setSettingsOpen(false)
  setSessionEditorOpen(false)
  sshForm.hidden = true
  closeDirectoryBrowser()
  closeContextPopover()
  closeNewSessionMenu()
  if (editingGroupId) {
    editingGroupId = ''
    renderSessionList()
  }
})
contextRuntime.addEventListener('click', (event) => {
  event.stopPropagation()
  openContextPopover('node', contextRuntime)
})
contextBranch.addEventListener('click', (event) => {
  event.stopPropagation()
  openContextPopover('branch', contextBranch)
})
contextChanges.addEventListener('click', (event) => {
  event.stopPropagation()
  openContextPopover('changes', contextChanges)
})
contextPopover.addEventListener('click', (event) => event.stopPropagation())
contextPopoverSearch.addEventListener('input', () => {
  if (contextPopoverKind !== 'branch' || !latestGitDetails) return
  renderBranchChoices(latestGitDetails)
})
sessionGroupInput.addEventListener('change', () => {
  const session = getActiveSession()
  if (!session) return
  if (sessionGroupInput.value) session.groupId = sessionGroupInput.value
  else delete session.groupId
  rememberSessions()
  renderSessionList()
})
contextDirectory.addEventListener('click', (event) => {
  event.stopPropagation()
  closeContextPopover()
  if (contextDirectory.dataset.remote === '1') {
    closeDirectoryBrowser()
    showTerminalNotice(contextDirectory.title)
    return
  }
  if (!directoryBrowser.hidden) {
    closeDirectoryBrowser()
    return
  }
  void openDirectoryBrowser(contextDirectory.dataset.path || currentFilePath)
})
directoryBrowser.addEventListener('click', (event) => event.stopPropagation())
function setSidebarCollapsed(collapsed: boolean): void {
  document.body.classList.toggle('sidebar-collapsed', collapsed)
  const toggle = element<HTMLButtonElement>('#sidebar-toggle')
  const reveal = element<HTMLButtonElement>('#sidebar-reveal')
  toggle.setAttribute('aria-expanded', String(!collapsed))
  toggle.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏')
  reveal.hidden = !collapsed
  requestAnimationFrame(() => {
    fitAddon.fit()
    resizeActiveTerminal()
  })
}

element<HTMLButtonElement>('#sidebar-toggle').addEventListener('click', (event) => {
  event.stopPropagation()
  setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'))
})
element<HTMLButtonElement>('#sidebar-reveal').addEventListener('click', (event) => {
  event.stopPropagation()
  setSidebarCollapsed(false)
})
element<HTMLElement>('#mobile-menu').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-open')
})

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
    event.preventDefault()
    terminalSearch.hidden = false
    terminalSearchInput.focus()
    terminalSearchInput.select()
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    commandSearch.focus()
  }
  if ((event.metaKey || event.ctrlKey) && event.key === '1') {
    event.preventDefault()
    terminal.focus()
  }
})

terminalSearch.addEventListener('submit', (event) => {
  event.preventDefault()
  searchAddon.findNext(terminalSearchInput.value, { caseSensitive: false })
})
element<HTMLButtonElement>('#terminal-search-prev').addEventListener('click', () => {
  searchAddon.findPrevious(terminalSearchInput.value, { caseSensitive: false })
})
terminalSearchInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  terminalSearch.hidden = true
  terminal.focus()
})
showAuditButton.addEventListener('click', () => {
  const open = auditLog.hidden
  auditLog.hidden = !open
  if (!open) return
  auditLog.textContent = '正在读取…'
  void window.unixbridge.recentAudit().then((records) => {
    auditLog.textContent = records.length === 0
      ? '还没有风险记录。'
      : records.map((record) => `${record.timestamp}  ${record.outcome}  ${record.decision.ruleId}  ${record.input}`).join('\n')
  }).catch((error: unknown) => {
    auditLog.textContent = error instanceof Error ? error.message : String(error)
  })
})

window.addEventListener('beforeunload', () => {
  removeDataListener()
  removeExitListener()
  removeRiskListener()
  removeModeListener()
  removeDirectoryListener()
  removeUploadProgressListener()
  resizeObserver.disconnect()
  window.clearInterval(metricsTimer)
})

syncAiSettings()
void window.unixbridge.loadAi().then((saved) => {
  if (!saved) return
  aiPreferences.provider = saved.provider
  aiPreferences.endpoint = saved.endpoint
  aiPreferences.model = saved.model
  localStorage.setItem('unixbridge:ai-preferences', JSON.stringify(aiPreferences))
  syncAiSettings()
  if (saved.hasApiKey && !saved.encryptionAvailable) {
    aiConfigStatus.textContent = '当前环境无法加密密钥，关闭后需要重新填写'
  } else if (saved.hasApiKey) {
    aiApiKeyInput.placeholder = '已加密保存，留空则保持不变'
    aiConfigStatus.textContent = '已恢复本机加密保存的 API Key，界面不会回显'
  } else {
    aiConfigStatus.textContent = 'AI 已就绪'
  }
}).catch((error: unknown) => {
  aiConfigStatus.textContent = error instanceof Error ? error.message : String(error)
})
saveAndApplyAppearance()
const metricsTimer = window.setInterval(() => void refreshMetrics(), 2_000)
void refreshMetrics()
element<HTMLButtonElement>('#preview-close').addEventListener('click', () => closePreview())
element<HTMLButtonElement>('#preview-insert').addEventListener('click', () => {
  if (!previewPath) return
  insertTerminalText(`${quoteDirectory(previewPath, getActiveSession()?.platform ?? null)} `)
})
element<HTMLButtonElement>('#new-ssh').addEventListener('click', (event) => {
  event.stopPropagation()
  sshForm.hidden = !sshForm.hidden
  if (!sshForm.hidden) sshTargetInput.focus()
})
sshForm.addEventListener('click', (event) => event.stopPropagation())
sshForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const hint = sshForm.querySelector('small')
  const target = parseSshTarget(sshTargetInput.value)
  if (!target) {
    if (hint) hint.textContent = '请输入 user@host，或 user@host:端口'
    return
  }
  if (hint) hint.textContent = '断线后自动重连，远端有 tmux 时会话会保留。'
  sshForm.hidden = true
  sshTargetInput.value = ''
  void startSession({ ssh: target })
})

void loadFiles()
void restoreSessions()
