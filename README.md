# unixbridge

一个面向 Windows 10/11 的 Warp-like 跨命令语义终端。

unixbridge 允许用户输入 `ls -la`、`pwd`、`cat`、`grep` 等 Linux/macOS 风格命令。
它的目标不是把命令字符串简单翻译成 PowerShell，而是将输入解析为 AST，通过内置的
Unix-semantics 命令层执行，并为管道和界面保留结构化结果。

项目采用 Electron、xterm.js 和 node-pty，底层终端连接 Windows ConPTY。复杂命令将在
后续版本中通过用户明确选择的 WSL、Git Bash 或 PowerShell fallback 执行。

## 项目状态

当前版本：`0.1.0`，处于 M0 基础设施阶段。

已完成：

- Electron 主进程、隔离 preload 和最小安全 IPC。
- xterm.js 全屏终端以及 node-pty 生命周期、输入输出和 resize。
- Windows PowerShell/ConPTY 启动链路。
- tokenizer、受限语法 AST parser 和解析诊断。
- ShellState、OutputBlock、命令 registry 接口。
- 支持 `-l -a -h -R` 的结构化 `ls` 实现草稿。
- deny / confirm / warn / allow RiskPolicy。
- Wave 风格可配置多面板工作区，可独立开关 AI、系统指标和文件浏览器。
- 本地 OpenAI-compatible / API Key AI 接入；API Key 只保存在主进程内存。
- NVIDIA GPU 使用率检测（不可用时明确降级为 CPU）和内存趋势展示。
- 当前用户目录内的只读文件浏览器、布局预设与面板宽度设置。
- `ls`、`ps`、`df` 通过正则适配器解析为结构化 rows；语义表头和图例渲染在独立的界面层，真实命令仍交给当前 Shell。
- 23 个单元测试和 Electron 启动 e2e 烟测。

尚未完成：

- 默认命令输入仍未接入白名单 Dispatcher。
- 除 `ls` 外的 registry 命令目前只有 schema，尚无内置执行器。
- Warp-like block UI、结构化 pipeline 和 fallback 尚未实现。

> 安全提示：M0 的 PTY 是开发用原始 PowerShell 通道，尚未经过白名单 Dispatcher，
> 不能视为安全执行环境。请勿在不可信环境中运行未知或高风险命令。

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

macOS/Linux 只提供开发预览，会启动 `$SHELL` 并在界面明确显示“非 ConPTY”；这不代表
目标平台能力已通过验证。

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
- `npm test`：运行 parser、registry、`ls`、RiskPolicy 单元测试。
- `npm run e2e`：先构建，再运行 Electron 启动烟测。
- `npm run package` / `npm run package:mac`：构建当前 Apple Silicon 开发机使用的
  macOS DMG；开发包未签名，首次打开时需要在系统设置中确认。
- `npm run package:win`：构建 Windows x64 NSIS `.exe`。依赖包内的 Windows
  `node-pty` 预编译模块，发布前仍应在 Windows 10/11 实机验证 ConPTY。

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
- RiskPolicy：deny / confirm / warn / allow 决策及 audit record 类型。策略尚未接入 M0
  原始 PTY。

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

### M1：白名单执行路径

- [ ] 增加 Warp-like command editor，不把默认输入直接写入 PTY。
- [ ] Dispatcher 串联 parser、registry、ShellState、RiskPolicy 和 OutputBlock。
- [ ] 实现 `pwd/cd/cat/echo/clear/history/mkdir/which/env`，所有文件参数走 path 模块。
- [ ] 实现 `echo hello > a.txt` 的程序内重定向，禁止 shell 字符串拼接。
- [ ] command registry + cwd 文件补全，并在 `cd` 后更新 prompt。

### M2：文件与进程命令、安全确认

- [ ] 实现 `cp/mv/rm/touch/head/tail/ps/kill`。
- [ ] 为 `rm -rf`、`kill -9`、提权和系统路径写入接入不可绕过的确认 UI。
- [ ] 实现可关闭的本地 JSONL audit log，记录确认、拒绝、执行和结果。
- [ ] 为 TOCTOU、symlink/junction 和系统目录边界增加 Windows 测试。

### M3：结构化管道与 blocks

- [ ] 实现 `grep/find`；`grep` 同时消费文本和 table rows，并保留 `sourceBlockId`。
- [ ] Pipeline 执行结构化结果；定义文本降级规则和 stderr/exit code 传播。
- [ ] block UI：状态、耗时、折叠、复制、重跑和错误解释卡片。
- [ ] 历史搜索与持久化。

### M4：明确 fallback

- [ ] 检测 WSL、Git Bash、PowerShell 能力，fallback 前显示目标后端和风险。
- [ ] `sed/awk/curl/git/docker` 未配置 fallback 时给友好建议，不静默执行。
- [ ] PowerShell 使用 `-Command -` 和编码/参数化输入；增加注入测试。
- [ ] 在 Windows CI 跑 ConPTY、取消危险操作、fallback 和 NSIS 打包烟测。

## `ls -la` Windows 手工验收

1. 在包含 `.hidden`、普通文件和子目录的目录运行 `ls -la` 单元接口。
2. 确认首行为 `total`，每行含 mode/links/owner/group/size/mtime/name。
3. 确认目录带 `/`、隐藏文件存在、错误不会令进程崩溃、成功 exit code 为 0。
4. Windows 上运行 `npm run e2e`，确认标题栏显示 `PowerShell · ConPTY`。

## 贡献

欢迎提交 issue 和 pull request。涉及命令语义、安全策略或 fallback 的改动，请同时提供：

- 对应的单元测试或 e2e 测试。
- Windows 与 Unix 语义差异说明。
- 风险等级、确认行为和命令注入防护说明。

## 许可证

当前仓库尚未添加开源许可证。在选择许可证前，默认保留全部权利；如需公开协作，建议
根据项目目标添加 MIT、Apache-2.0 或其他合适的许可证文件。
