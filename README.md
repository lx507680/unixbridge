# unixbridge

一个面向 Windows 10/11 的 Warp-like 跨命令语义终端。

unixbridge 允许用户输入 `ls -la`、`pwd`、`cat`、`grep` 等 Linux/macOS 风格命令。
它的目标不是把命令字符串简单翻译成 PowerShell，而是将输入解析为 AST，通过内置的
Unix-semantics 命令层执行，并为管道和界面保留结构化结果。

项目采用 Electron、xterm.js 和 node-pty，底层终端连接 Windows ConPTY。复杂命令将在
后续版本中通过用户明确选择的 WSL、Git Bash 或 PowerShell fallback 执行。

## 项目状态

当前版本：`0.1.0`。这是一个可交互的 Electron 终端工作区，底层会话仍然是真实 shell
（macOS/Linux 为登录 shell，Windows 为 PowerShell/ConPTY）。

已接入：

- 多会话 PTY、会话分组、SSH 启动参数和本地会话恢复。
- 提交到 PTY 的整行输入会先经过 parser、命令 registry、ShellState 和 RiskPolicy。
  `deny` 会取消这一行，`confirm` 必须在界面确认后才会送出回车。普通命令仍由当前 shell 执行。
- 文件浏览、预览和 `unixbridge://preview` 只解析当前用户目录；符号链接和 junction 会再做一次 realpath 校验。
- AI 配置的 API Key 加密后保存在本机。界面只知道“是否已保存”，不会收到明文密钥。
  系统无法加密时，密钥只留在本次运行的主进程内存中，并在界面提示。
- API 模式拒绝把密钥发往本机或内网地址；本地模式仍可连接 loopback 模型服务。
- 列说明、命令补全、工作区布局、文件预览和 Windows 命令翻译提示。

安全边界：

- 这不是一个只执行白名单命令的隔离执行器。允许和仅警告的命令会进入真实 shell。
- 方向键翻出的历史命令由 unixbridge 自己重写整行，再交给风险策略。全屏程序里的按键原样送入程序。
- 风险记录保存在本机并只保留最近 200 条，可在设置里查看。预览地址带一次性令牌，文本预览始终按纯文本渲染。
- SSH 会话中把文件或文件夹拖到终端，会用本机 `scp` 上传到该会话的远程当前目录。只接受当前用户目录内的路径，符号链接不能指向目录之外。尚未拿到远程目录时上传到远程家目录。拖放上传使用已有 SSH 密钥或 ssh-agent，不会弹出密码。

## 核心目标

- 明确支持常用 Linux 风格命令子集，不追求完整 Bash 兼容。
- 所有路径由程序规范化，覆盖盘符、UNC、相对路径和两种路径分隔符。
- 内置命令通过 Node API 和 argv 执行，不拼接 shell 字符串。
- 危险操作必须确认，拒绝的操作不得静默 fallback。
- 输出既可以渲染为类 Unix 文本，也可以作为结构化 rows 被 pipeline 消费。
- Unix 与 Windows 无法等价的行为必须显式记录，不伪装兼容。

## 环境要求

- Node.js 20 或更高版本、npm
- Windows 10 1809+ 或 Windows 11（ConPTY）
- PowerShell 7 (`pwsh.exe`) 或 Windows PowerShell 5.1 (`powershell.exe`)
- 安装 node-pty 原生依赖所需的 Python 与 Visual Studio Build Tools（Desktop
  development with C++）

macOS/Linux 会启动 `$SHELL`，状态栏显示实际 shell 名称和 PID。Windows 仍显示
`PowerShell · ConPTY`。

## 快速开始

```bash
nvm install 22
nvm use 22
npm install
npm run dev
```

开发与验证命令：

```bash
npm run typecheck
npm test
npm run e2e
npm run package:mac
npm run package:win
```

- `npm run dev`：启动 Electron 开发模式。
- `npm test`：运行 parser、RiskPolicy、PTY 门禁、路径沙箱和命令语义单元测试。
- `npm run e2e`：先构建，再运行 Electron 启动烟测。
- `npm run package` / `npm run package:mac`：构建当前 Apple Silicon 开发机使用的
  macOS DMG。完整命令：

  ```bash
  npm run build && electron-builder --mac dmg --config.electronDist=node_modules/electron/dist
  ```

  产物：`dist/unixbridge-0.1.0-arm64.dmg`。开发包未签名，首次打开时需要在系统设置中确认。
- `npm run package:win`：构建 Windows x64 NSIS `.exe`。完整命令：

  ```bash
  npm run build && electron-builder --win nsis --x64 --config.npmRebuild=false
  ```

  产物：`dist/unixbridge-0.1.0-setup-x64.exe`。依赖包内的 Windows `node-pty`
  预编译模块，发布前仍应在 Windows 10/11 实机验证 ConPTY。安装包未签名，首次打开会遇到 SmartScreen 提示。

如果 Vite 报告 `node:fs/promises` 缺少导出，请先执行 `node -v`。项目要求 Node.js
20 或更高版本，推荐 Node.js 22 LTS。

## 当前目录

```text
src/
  main/            Electron 窗口、IPC、PTY 生命周期
  preload/         最小 contextBridge API
  renderer/        xterm.js 全屏终端和主题 token
  core/
    parser/        tokenizer、AST、受限语法 parser
    shellstate/    cwd/env/alias/exit code/history
    commands/      registry、schema、结构化 ls
    dispatch/      RiskPolicy 与审计记录类型
    output/        block 和结构化输出模型
    path/          路径规范化与基础 glob
tests/
  unit/
  e2e/
```

## 已实现的接口边界

- Parser：支持 `&&`、`||`、`|`、`>`、`>>`、`2>`、`2>&1`、`;`、单/双引号。
- 明确拒绝：`$(...)`、`<(...)` / `>(...)`、here-doc。尚未实现变量展开、alias
  展开、完整 Bash grammar、job control。
- Registry：列出 MVP 白名单；当前只有 `ls` 绑定了内置执行器，其余是 M1/M2 schema。
- `ls`：`-l -a -h -R`、基础 `*` / `?` glob、结构化 rows、文本渲染、目录 `/`
  后缀、错误列表和 exit code。
- RiskPolicy 已接在 PTY 提交路径上：`deny` 取消该行，`confirm` 需要界面确认，`warn` 会提示并继续交给当前 shell。
- Registry 目前只有 `ls` 绑定了内置执行器。其余白名单命令仍由当前 shell 执行，registry 负责识别和审计。

## Unix / Windows 语义 TODO

- Windows NTFS ACL/SID 不等价于 POSIX mode/uid/gid。M0 的 mode 使用 Node `stat.mode`
  最佳努力值，owner 使用当前用户，group 使用 `BUILTIN\\Administrators` 占位；后续应
  增加可失败但不导致 `ls` 崩溃的 ACL 查询。
- `ls total` 当前是 apparent bytes 总和，不是 GNU `ls` 的文件系统 block count。
- Windows 路径会在程序内规范化；UNC、盘符、两种分隔符已保留设计入口。当前 glob
  仅允许最后一个路径段含 `*` / `?`，不支持 `**` 或目录段 glob。
- Windows 隐藏属性与 Unix 点文件不是同一概念。M0 的 `-a` 只按名称是否以 `.` 开头
  判断，不读取 DOS hidden attribute。
- symlink/junction、大小写、长路径前缀和 ACL 拒绝访问需要增加 Windows 专项 fixtures。
- fallback 必须使用 argv/标准输入参数化，不得拼接 PowerShell 字符串。尚未实现
  WSL/Git Bash 检测与执行。

## 下一任务分解

这些命令仍由当前真实 shell 执行。unixbridge 负责在提交前做风险判断，并在界面跟上目录、补全和命令块。

### M1：真实提示符与补全

- [x] 输入留在真实提示符上，整行提交前经过风险策略。
- [x] Dispatcher 在命令进入 PTY 前串联 parser、registry、ShellState 和 RiskPolicy。
- [x] 允许和仅警告的命令进入当前 shell，而不是另一套白名单执行器。
- [x] 输入路径片段时，按当前目录补全文件和文件夹。
- [x] shell 回报当前目录后，更新目录芯片和文件列表。

### M2：文件与进程命令、安全确认

- [x] `cp/mv/rm/touch/head/tail/ps/kill` 由当前 shell 执行，并出现在命令说明和补全里。
- [x] `rm -rf`、`kill -9`、提权和系统路径写入必须在界面确认后才会送出回车。
- [x] 本地 JSONL 风险记录可以在设置里打开和收起，只保留最近 200 条。
- [ ] 为 TOCTOU、symlink/junction 和系统目录边界增加 Windows 实机测试。

### M3：命令块与历史

- [x] 命令块显示状态、耗时、折叠、复制、重跑，并在常见错误输出下给出一句说明。
- [x] 历史命令保存在本机，可用命令搜索和终端搜索找回。
- [ ] `grep/find` 的结构化管道，以及跨命令传递 table rows。

### M4：明确 fallback

- [x] 当前 shell 就是执行后端：macOS/Linux 为登录 shell，Windows 为 PowerShell/ConPTY。
- [ ] 检测 WSL 与 Git Bash；未安装时对 `sed/awk` 给出建议，而不是假装已经执行。
- [ ] 在 Windows CI 跑 ConPTY、取消危险操作和 NSIS 打包烟测。

## `ls -la` 验收

单元测试在临时目录里覆盖下面三项。Windows 标题栏仍需要在 Windows 上跑 `npm run e2e` 确认。

1. 目录包含 `.hidden`、普通文件和子目录。
2. 首行是 `total`，每行含 mode/links/owner/group/size/mtime/name。
3. 目录名带 `/`，隐藏文件存在，错误不会令进程崩溃。

## 贡献

欢迎提交 issue 和 pull request。涉及命令语义、安全策略或 fallback 的改动，请同时提供：

- 对应的单元测试或 e2e 测试。
- Windows 与 Unix 语义差异说明。
- 风险等级、确认行为和命令注入防护说明。

## 许可证

当前仓库尚未添加开源许可证。在选择许可证前，默认保留全部权利；如需公开协作，建议
根据项目目标添加 MIT、Apache-2.0 或其他合适的许可证文件。
