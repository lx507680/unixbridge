import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import './style.css'

const container = document.querySelector<HTMLElement>('#terminal')
const status = document.querySelector<HTMLElement>('#session-status')

if (!container || !status) throw new Error('终端容器初始化失败')

const terminal = new Terminal({
  cursorBlink: true,
  convertEol: true,
  fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
  fontSize: 14,
  scrollback: 10_000,
  theme: {
    background: '#0b0f14',
    foreground: '#d6deeb',
    cursor: '#7ee787',
    selectionBackground: '#264f78',
    black: '#0b0f14',
    red: '#ff7b72',
    green: '#7ee787',
    yellow: '#d29922',
    blue: '#79c0ff',
    magenta: '#d2a8ff',
    cyan: '#a5d6ff',
    white: '#f0f6fc'
  }
})
const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
terminal.open(container)
fitAddon.fit()

const removeDataListener = window.unixbridge.onData((data) => terminal.write(data))
const removeExitListener = window.unixbridge.onExit((exitCode) => {
  status.textContent = `会话已退出 (${exitCode})`
  status.dataset.state = 'stopped'
  terminal.write(`\r\n\x1b[33m[unixbridge] PowerShell 已退出，退出码 ${exitCode}\x1b[0m\r\n`)
})

terminal.onData((data) => window.unixbridge.write(data))

let resizeFrame = 0
const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    fitAddon.fit()
    window.unixbridge.resize(terminal.cols, terminal.rows)
  })
})
resizeObserver.observe(container)

window.addEventListener('beforeunload', () => {
  removeDataListener()
  removeExitListener()
  resizeObserver.disconnect()
})

window.unixbridge
  .start(terminal.cols, terminal.rows)
  .then(({ platform, pid }) => {
    const shellLabel = platform === 'win32' ? 'PowerShell · ConPTY' : '开发 shell · 非 ConPTY'
    status.textContent = `${shellLabel} · PID ${pid}`
    status.dataset.state = 'running'
    terminal.focus()
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    status.textContent = '启动失败'
    status.dataset.state = 'stopped'
    terminal.write(`\x1b[31m[unixbridge] ${message}\x1b[0m\r\n`)
  })
