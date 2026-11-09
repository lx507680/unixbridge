import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import './style.css'

function element<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`界面元素初始化失败: ${selector}`)
  return node
}

const container = element<HTMLElement>('#terminal')
const status = element<HTMLElement>('#session-status')
const sessionPlatform = element<HTMLElement>('#session-platform')
const commandSearch = element<HTMLInputElement>('#command-search')
const terminalBlock = element<HTMLElement>('.terminal-block')
const emptySearch = element<HTMLElement>('#empty-search')
const settingsPopover = element<HTMLElement>('#settings-popover')
const settingsButton = element<HTMLButtonElement>('#view-settings')
const topSettingsButton = element<HTMLButtonElement>('#top-settings')
const sessionTitle = element<HTMLElement>('#session-title')
const workspaceTitleLabel = element<HTMLElement>('#workspace-title-label')
const workspaceSubtitle = element<HTMLElement>('#workspace-subtitle')
const sessionEditor = element<HTMLElement>('#session-editor')
const editSessionButton = element<HTMLButtonElement>('#edit-session')
const sessionNameInput = element<HTMLInputElement>('#session-name')
const aiPanel = element<HTMLElement>('#ai-panel')
const metricsWidget = element<HTMLElement>('#metrics-widget')
const filesWidget = element<HTMLElement>('#files-widget')
const widgetsPanel = element<HTMLElement>('#widgets-panel')
const workbench = element<HTMLElement>('#workbench')
const aiResizer = element<HTMLElement>('#ai-resizer')
const widgetsResizer = element<HTMLElement>('#widgets-resizer')
const aiWidthInput = element<HTMLInputElement>('#ai-width')
const widgetsWidthInput = element<HTMLInputElement>('#widgets-width')
const aiWidthValue = element<HTMLOutputElement>('#ai-width-value')
const widgetsWidthValue = element<HTMLOutputElement>('#widgets-width-value')
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
const contextRuntime = element<HTMLElement>('#context-runtime')
const contextDirectory = element<HTMLElement>('#context-directory')
const contextBranch = element<HTMLElement>('#context-branch')
const contextChanges = element<HTMLElement>('#context-changes')
const contextCommand = element<HTMLElement>('#context-command')

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
  widgetsWidth: 240
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
  fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.35,
  scrollback: 10_000,
  theme: terminalThemes[appearance.theme]
})
const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
terminal.open(container)
fitAddon.fit()

function saveAndApplyAppearance(): void {
  localStorage.setItem('unixbridge:appearance', JSON.stringify(appearance))
  document.body.dataset.theme = appearance.theme
  document.body.dataset.view = appearance.view
  document.body.dataset.density = appearance.density
  document.body.dataset.layout = appearance.layout
  terminal.options.theme = terminalThemes[appearance.theme]
  document.documentElement.style.setProperty('--session-color', appearance.sessionColor)
  document.documentElement.style.setProperty('--ai-panel-width', `${appearance.aiWidth}px`)
  document.documentElement.style.setProperty('--widgets-panel-width', `${appearance.widgetsWidth}px`)
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
  if (document.activeElement !== sessionNameInput) sessionNameInput.value = appearance.sessionName
  aiWidthInput.value = String(appearance.aiWidth)
  widgetsWidthInput.value = String(appearance.widgetsWidth)
  aiWidthValue.value = `${appearance.aiWidth}px`
  widgetsWidthValue.value = `${appearance.widgetsWidth}px`
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

  const titleMap: Record<PaneTitle, string> = {
    command: appearance.sessionName,
    directory: '~/workspace',
    branch: 'main'
  }
  sessionTitle.textContent = titleMap[appearance.title]
  workspaceTitleLabel.textContent = appearance.sessionName
  workspaceSubtitle.textContent = appearance.title === 'branch' ? 'main' : '~/workspace'

  for (const node of document.querySelectorAll<HTMLElement>('[data-metadata]')) {
    node.hidden = !appearance.metadata.includes(node.dataset.metadata ?? '')
  }

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
  for (const button of document.querySelectorAll<HTMLButtonElement>('.color-options [data-color]')) {
    button.classList.toggle('is-selected', button.dataset.color === appearance.sessionColor)
  }

  requestAnimationFrame(() => {
    fitAddon.fit()
    window.unixbridge.resize(terminal.cols, terminal.rows)
  })
}

function setSettingsOpen(open: boolean, origin: 'sidebar' | 'top' = 'sidebar'): void {
  const wasOpen = !settingsPopover.hidden
  if (open) setSessionEditorOpen(false)
  settingsPopover.hidden = !open
  settingsButton.setAttribute('aria-expanded', String(open))
  settingsButton.classList.toggle('is-active', open)
  topSettingsButton.classList.toggle('is-active', open && origin === 'top')
  document.body.classList.toggle('settings-from-top', open && origin === 'top')
  if (!open && wasOpen) requestAnimationFrame(() => terminal.focus())
}

function setSessionEditorOpen(open: boolean): void {
  if (open) setSettingsOpen(false)
  sessionEditor.hidden = !open
  editSessionButton.classList.toggle('is-active', open)
  if (open) {
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

function installPanelResizer(
  handle: HTMLElement,
  side: 'ai' | 'widgets'
): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    handle.classList.add('is-dragging')
    const startX = event.clientX
    const startWidth = side === 'ai' ? appearance.aiWidth : appearance.widgetsWidth

    const onMove = (moveEvent: PointerEvent): void => {
      const delta = moveEvent.clientX - startX
      const requested = side === 'ai' ? startWidth + delta : startWidth - delta
      const otherWidth = side === 'ai' ? appearance.widgetsWidth : appearance.aiWidth
      const minWidth = side === 'ai' ? 200 : 220
      const maxWidth = Math.max(220, Math.min(420, workbench.clientWidth - otherWidth - 300))
      const width = Math.max(minWidth, Math.min(maxWidth, Math.round(requested / 10) * 10))
      appearance.layout = 'balanced'
      if (side === 'ai') {
        appearance.aiWidth = width
        aiWidthInput.value = String(width)
        aiWidthValue.value = `${width}px`
        document.documentElement.style.setProperty('--ai-column', `${width}px`)
      } else {
        appearance.widgetsWidth = width
        widgetsWidthInput.value = String(width)
        widgetsWidthValue.value = `${width}px`
        document.documentElement.style.setProperty('--widgets-column', `${width}px`)
      }
      fitAddon.fit()
    }

    const onUp = (): void => {
      handle.classList.remove('is-dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      saveAndApplyAppearance()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  })

  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 10 : -10
    if (side === 'ai') appearance.aiWidth = Math.max(200, Math.min(420, appearance.aiWidth + delta))
    else appearance.widgetsWidth = Math.max(220, Math.min(420, appearance.widgetsWidth - delta))
    appearance.layout = 'balanced'
    saveAndApplyAppearance()
  })
}

installPanelResizer(aiResizer, 'ai')
installPanelResizer(widgetsResizer, 'widgets')

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

function appendAiMessage(role: 'user' | 'assistant', content: string): HTMLElement {
  aiMessages.querySelector('.ai-welcome')?.remove()
  const message = document.createElement('div')
  message.className = `ai-message is-${role}`
  const label = document.createElement('strong')
  label.textContent = role === 'user' ? '你' : 'AI'
  const body = document.createElement('p')
  body.textContent = content
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
  chatMessages.push({ role: 'user', content })
  appendAiMessage('user', content)
  const pending = appendAiMessage('assistant', '正在思考…')
  sendAiButton.disabled = true

  void (async () => {
    try {
      await configureAi(false)
      const response = await window.unixbridge.chat(chatMessages)
      pending.remove()
      chatMessages.push({ role: 'assistant', content: response.content })
      appendAiMessage('assistant', response.content)
    } catch (error) {
      pending.querySelector('p')!.textContent = error instanceof Error ? error.message : String(error)
      pending.classList.add('is-error')
    } finally {
      sendAiButton.disabled = false
      aiInput.focus()
    }
  })()
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
      row.disabled = item.type !== 'directory'
      const name = document.createElement('span')
      name.textContent = `${item.type === 'directory' ? '▰' : '·'} ${item.name}`
      const size = document.createElement('span')
      size.textContent = item.type === 'directory' ? '—' : formatBytes(item.size)
      row.append(name, size)
      if (item.type === 'directory') row.addEventListener('click', () => void loadFiles(item.path))
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

const removeDataListener = window.unixbridge.onData((data) => terminal.write(data))
const removeExitListener = window.unixbridge.onExit((exitCode) => {
  status.textContent = `会话已退出 (${exitCode})`
  status.dataset.state = 'stopped'
  sessionPlatform.textContent = `已退出 · Code ${exitCode}`
  terminal.write(`\r\n\x1b[33m[unixbridge] 终端已退出，退出码 ${exitCode}\x1b[0m\r\n`)
})

let terminalInputBuffer = ''

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
    requestAnimationFrame(() => fitAddon.fit())
  } catch {
    terminalContext.hidden = true
  }
}

terminal.onData((data) => {
  window.unixbridge.write(data)
  if (data.includes('\r')) {
    const command = terminalInputBuffer.trim()
    terminalInputBuffer = ''
    if (command) void showWorkspaceContext(command)
    return
  }
  if (data === '\u007f') {
    terminalInputBuffer = terminalInputBuffer.slice(0, -1)
    return
  }
  if (!data.startsWith('\u001b') && !data.includes('\n')) terminalInputBuffer += data
})

let resizeFrame = 0
const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    if (container.clientWidth === 0 || container.clientHeight === 0) return
    try {
      fitAddon.fit()
      window.unixbridge.resize(terminal.cols, terminal.rows)
    } catch {
      // The terminal can be temporarily hidden while filtering command history.
    }
  })
})
resizeObserver.observe(container)

function setConnectionState(platform: NodeJS.Platform, pid: number): void {
  const isWindows = platform === 'win32'
  const label = isWindows ? 'PowerShell · ConPTY' : '开发 shell · 非 ConPTY'
  status.textContent = `${label} · PID ${pid}`
  status.dataset.state = 'running'
  sessionPlatform.textContent = `${isWindows ? 'PowerShell' : 'Local shell'} · PID ${pid}`
}

async function startSession(clear = false): Promise<void> {
  status.textContent = '正在启动终端…'
  status.dataset.state = ''

  if (clear) {
    terminal.reset()
    commandSearch.value = ''
    filterCommands('')
  }

  try {
    fitAddon.fit()
    const { platform, pid } = await window.unixbridge.start(terminal.cols, terminal.rows)
    setConnectionState(platform, pid)
    terminal.focus()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    status.textContent = '启动失败'
    status.dataset.state = 'stopped'
    sessionPlatform.textContent = '连接失败'
    terminal.write(`\x1b[31m[unixbridge] ${message}\x1b[0m\r\n`)
  }
}

function filterCommands(rawQuery: string): void {
  const query = rawQuery.trim().toLocaleLowerCase()
  const matches = !query || appearance.sessionName.toLocaleLowerCase().includes(query)

  terminalBlock.hidden = !matches
  emptySearch.hidden = !query || matches
}

commandSearch.addEventListener('input', () => filterCommands(commandSearch.value))
commandSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  commandSearch.value = ''
  filterCommands('')
  terminal.focus()
})

element<HTMLElement>('#new-session').addEventListener('click', () => void startSession(true))
element<HTMLElement>('#clear-terminal').addEventListener('click', () => {
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
settingsPopover.addEventListener('click', (event) => event.stopPropagation())
editSessionButton.addEventListener('click', (event) => {
  event.stopPropagation()
  setSessionEditorOpen(sessionEditor.hidden)
})
sessionEditor.addEventListener('click', (event) => event.stopPropagation())
sessionNameInput.addEventListener('input', () => {
  appearance.sessionName = sessionNameInput.value.trim() || '未命名会话'
  saveAndApplyAppearance()
})
sessionNameInput.addEventListener('blur', () => {
  if (sessionNameInput.value.trim()) return
  appearance.sessionName = '本地终端'
  saveAndApplyAppearance()
})
for (const button of document.querySelectorAll<HTMLButtonElement>('.color-options [data-color]')) {
  button.addEventListener('click', () => {
    appearance.sessionColor = button.dataset.color ?? defaultSettings.sessionColor
    saveAndApplyAppearance()
  })
}
document.addEventListener('click', () => {
  setSettingsOpen(false)
  setSessionEditorOpen(false)
})
element<HTMLElement>('#sidebar-toggle').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-collapsed')
  requestAnimationFrame(() => fitAddon.fit())
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
