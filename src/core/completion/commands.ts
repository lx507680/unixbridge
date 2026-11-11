export interface CommandSuggestion {
  command: string
  description: string
}

export const commonCommands: readonly CommandSuggestion[] = [
  { command: 'ls', description: '列出当前目录' },
  { command: 'ls -la', description: '列出权限、所有者和时间' },
  { command: 'ls -lh', description: '以易读大小列出目录' },
  { command: 'cd', description: '切换目录' },
  { command: 'pwd', description: '显示当前目录' },
  { command: 'cat', description: '查看文件内容' },
  { command: 'mkdir', description: '创建目录' },
  { command: 'rm', description: '删除文件' },
  { command: 'cp', description: '复制文件' },
  { command: 'mv', description: '移动或重命名' },
  { command: 'touch', description: '创建空文件' },
  { command: 'find', description: '查找文件' },
  { command: 'grep', description: '在文本中搜索' },
  { command: 'rg', description: '快速搜索代码' },
  { command: 'git status', description: '查看工作区状态' },
  { command: 'git diff', description: '查看未提交改动' },
  { command: 'git log', description: '查看提交历史' },
  { command: 'git add', description: '暂存文件' },
  { command: 'git commit', description: '提交改动' },
  { command: 'git pull', description: '拉取远程更新' },
  { command: 'git push', description: '推送到远程' },
  { command: 'git checkout', description: '切换分支或文件' },
  { command: 'git branch', description: '查看分支' },
  { command: 'npm install', description: '安装依赖' },
  { command: 'npm run', description: '运行脚本' },
  { command: 'npm test', description: '运行测试' },
  { command: 'npm start', description: '启动项目' },
  { command: 'pnpm install', description: '用 pnpm 安装依赖' },
  { command: 'pnpm test', description: '用 pnpm 运行测试' },
  { command: 'docker ps', description: '查看容器' },
  { command: 'docker images', description: '查看镜像' },
  { command: 'docker compose up', description: '启动编排服务' },
  { command: 'docker compose down', description: '停止编排服务' },
  { command: 'ssh', description: '连接远程主机' },
  { command: 'ps aux', description: '查看进程' },
  { command: 'df -h', description: '查看磁盘用量' },
  { command: 'du -sh', description: '查看目录大小' },
  { command: 'top', description: '查看实时进程' },
  { command: 'clear', description: '清屏' },
  { command: 'history', description: '查看历史命令' },
  { command: 'which', description: '查找命令位置' },
  { command: 'echo', description: '输出文本' },
  { command: 'export', description: '设置环境变量' },
  { command: 'curl', description: '请求网络地址' },
  { command: 'tar -xzf', description: '解压 tar.gz' },
  { command: 'unzip', description: '解压 zip' }
]

export interface SuggestOptions {
  commands?: boolean
  history?: boolean
}

export function explainCommandProblem(output: string): string | undefined {
  const line = output
    .split('\n')
    .map((item) => item.trim())
    .find((item) =>
      /command not found|No such file or directory|Permission denied|不是内部或外部命令|拒绝访问|找不到/i.test(item)
    )
  if (!line) return undefined
  if (/command not found|不是内部或外部命令/i.test(line)) return '当前 shell 找不到这个命令。'
  if (/No such file or directory|找不到/i.test(line)) return '路径不存在。'
  if (/Permission denied|拒绝访问/i.test(line)) return '没有权限访问这个路径。'
  return undefined
}

export function pathCompletionQuery(input: string): { parent: string; prefix: string } | undefined {
  if (!input || /\s$/.test(input)) return undefined
  const token = input.match(/\S+$/)?.[0]
  const command = input.trim().split(/\s+/)[0]
  if (!token || !command || token === command) return undefined
  if (!/[\\/]/.test(token) && !token.startsWith('.')) return undefined
  const slash = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
  if (slash < 0) return { parent: '', prefix: token }
  return {
    parent: token.slice(0, slash) || (token.startsWith('/') || token.startsWith('\\') ? token.slice(0, 1) : ''),
    prefix: token.slice(slash + 1)
  }
}

export function joinCompletionDirectory(cwd: string, parent: string): string {
  if (!parent) return cwd
  if (parent.startsWith('/') || /^[A-Za-z]:[\\/]/.test(parent)) return parent
  const separator = cwd.includes('\\') ? '\\' : '/'
  return `${cwd.replace(/[\\/]$/, '')}${separator}${parent.replace(/^[\\/]/, '')}`
}

export function suggestCommands(
  input: string,
  history: readonly string[] = [],
  options: SuggestOptions = {}
): CommandSuggestion[] {
  const query = input.trim().toLowerCase()
  if (!query) return []
  const includeCommands = options.commands !== false
  const includeHistory = options.history !== false
  const seen = new Set<string>()
  const results: CommandSuggestion[] = []
  const push = (command: string, description: string): void => {
    const key = command.toLowerCase()
    if (seen.has(key) || !key.startsWith(query) || key === query) return
    seen.add(key)
    results.push({ command, description })
  }
  if (includeHistory) {
    for (const command of [...history].reverse()) push(command, '历史命令')
  }
  if (includeCommands) {
    for (const item of commonCommands) push(item.command, item.description)
  }
  return results.slice(0, 8)
}
