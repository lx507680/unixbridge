import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'

test('opens the Warp-like workspace and runs a command', async () => {
  const aiServer = createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    })
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: '**AI e2e**\n\n- ' } }] })}\n\n`
    )
    setTimeout(() => {
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'response\n\n```sh\necho ok\n```' } }] })}\n\n`
      )
      response.end('data: [DONE]\n\n')
    }, 40)
  })
  aiServer.listen(0, '127.0.0.1')
  await once(aiServer, 'listening')
  const address = aiServer.address()
  if (!address || typeof address === 'string') throw new Error('无法启动 AI 测试服务')
  const aiEndpoint = `http://127.0.0.1:${address.port}/v1`

  const userDataDirectory = await mkdtemp(join(tmpdir(), 'unixbridge-e2e-'))
  const application = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDirectory}`]
  })
  try {
    const window = await application.firstWindow()
    await expect(window).toHaveTitle('unixbridge')
    await expect(window.locator('.sidebar')).toBeVisible()
    await expect(window.locator('#terminal')).toBeVisible()
    await expect(window.locator('#toggle-ai img')).toBeVisible()
    await expect(window.locator('#toggle-ai img')).toHaveAttribute('src', /unixbridge-icon/)
    await expect(window.locator('#session-status')).not.toHaveText('正在启动终端…', {
      timeout: 15_000
    })

    const shellStatus =
      process.platform === 'win32'
        ? 'PowerShell · ConPTY'
        : `${(process.env.SHELL ?? '/bin/zsh').split(/[\\/]/).pop()} · PID`
    await expect(window.locator('#session-status')).toContainText(shellStatus)
    await expect(window.locator('#session-status')).not.toContainText('开发')

    await window.locator('#terminal').click()
    await window.keyboard.type(
      process.platform === 'win32'
        ? 'Write-Output __POWERSHELL_NATIVE_OK__'
        : "printf '__NATIVE_UNIX_OK__\\n'"
    )
    await window.keyboard.press('Enter')
    await expect(window.locator('.xterm-rows')).toContainText(
      process.platform === 'win32' ? '__POWERSHELL_NATIVE_OK__' : '__NATIVE_UNIX_OK__'
    )
    await window.keyboard.type('echo __UNIX_STYLE_OK__')
    await window.keyboard.press('Enter')
    await expect(window.locator('.xterm-rows')).toContainText('__UNIX_STYLE_OK__')
    await window.locator('#terminal').click()
    await window.keyboard.type('rm -rf __unixbridge_blocked__')
    await window.keyboard.press('Enter')
    await expect(window.locator('#command-risk')).toBeVisible()
    await expect(window.locator('#command-risk-text')).toContainText('删除')
    await window.locator('#command-risk-cancel').click()
    await expect(window.locator('#command-risk')).toBeHidden()

    await window.locator('#new-session').click()
    await window.locator('#create-terminal').click()
    await expect(window.locator('.session-card')).toHaveCount(2)
    await expect(window.locator('#session-count')).toHaveText('2')
    await expect(window.locator('.session-item.is-active strong')).toHaveText('终端 2')
    await window.locator('#terminal').click()
    await window.keyboard.type('echo second-session')
    await window.keyboard.press('Enter')
    await expect(window.locator('.xterm-rows')).toContainText('second-session')
    await window.locator('.session-item').first().click()
    await window.locator('#terminal').click()
    await window.keyboard.type('echo first-session')
    await window.keyboard.press('Enter')
    await expect(window.locator('.xterm-rows')).toContainText('first-session')
    await window.locator('.session-item').nth(1).click()
    await expect(window.locator('.xterm-rows')).toContainText('second-session')

    await expect(window.locator('.sidebar-tools #command-search')).toBeVisible()
    await expect(window.locator('#command-form')).toHaveCount(0)
    await window.locator('#top-settings').click()
    await expect(window.locator('#settings-popover')).toBeVisible()
    const aiToggle = window.locator('[data-setting="panels"] input[value="ai"]')
    const metricsToggle = window.locator('[data-setting="panels"] input[value="metrics"]')
    const filesToggle = window.locator('[data-setting="panels"] input[value="files"]')
    await aiToggle.check()
    await metricsToggle.check()
    await filesToggle.check()
    await window.locator('#settings-width').fill('320')

    for (const width of [1024, 1280, 1440]) {
      await application.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height)
        },
        { width, height: 900 }
      )
      await window.waitForTimeout(250)
      const terminalBox = await window.locator('.terminal-column').boundingBox()
      const settingsBox = await window.locator('#settings-popover').boundingBox()
      if (!terminalBox || !settingsBox) throw new Error(`${width}px 下设置面板不可见`)
      expect(terminalBox.width).toBeGreaterThan(280)
      expect(terminalBox.x + terminalBox.width).toBeLessThanOrEqual(settingsBox.x + 1)
    }

    const terminalWidthWithSettings =
      (await window.locator('.terminal-column').boundingBox())?.width ?? 0
    const settingsBeforeDrag = await window.locator('#settings-popover').boundingBox()
    const settingsHandle = await window.locator('#settings-resizer').boundingBox()
    if (!settingsBeforeDrag || !settingsHandle) throw new Error('设置面板拖拽手柄不可见')
    await window.mouse.move(settingsHandle.x + settingsHandle.width / 2, settingsHandle.y + 100)
    await window.mouse.down()
    await window.mouse.move(settingsHandle.x - 40, settingsHandle.y + 100)
    await window.mouse.up()
    await expect
      .poll(async () => (await window.locator('#settings-popover').boundingBox())?.width ?? 0)
      .toBeGreaterThan(settingsBeforeDrag.width)
    const draggedSettingsWidth =
      (await window.locator('#settings-popover').boundingBox())?.width ?? 0
    expect(draggedSettingsWidth).toBeGreaterThanOrEqual(280)
    expect(draggedSettingsWidth).toBeLessThanOrEqual(420)

    await window.locator('#top-settings').click()
    await expect
      .poll(async () => (await window.locator('.terminal-column').boundingBox())?.width ?? 0)
      .toBeGreaterThan(terminalWidthWithSettings)

    for (const width of [1024, 1280, 1440]) {
      await application.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height)
        },
        { width, height: 900 }
      )
      await window.waitForTimeout(300)
      const terminalBox = await window.locator('.terminal-column').boundingBox()
      const systemBox = await window.locator('#widgets-panel').boundingBox()
      if (!terminalBox || !systemBox) throw new Error(`${width}px 下系统面板不可见`)
      expect(terminalBox.width).toBeGreaterThan(260)
      expect(terminalBox.x + terminalBox.width).toBeLessThanOrEqual(systemBox.x + 1)
    }

    await expect(window.locator('#ai-panel')).toBeVisible()
    await expect(window.locator('#file-list .file-row').first()).toBeVisible({ timeout: 15_000 })
    await expect(window.locator('#processor-value')).not.toHaveText('--%', { timeout: 15_000 })
    await window.locator('#top-settings').click()

    await window.locator('[data-setting="theme"] [data-value="light"]').click()
    await window.locator('[data-setting="density"] [data-value="comfortable"]').click()
    await window.locator('[data-setting="layout"] [data-value="terminal"]').click()
    await expect(window.locator('body')).toHaveAttribute('data-layout', 'terminal')
    await expect(window.locator('#ai-panel')).toBeHidden()
    await expect(window.locator('#widgets-panel')).toBeHidden()
    await expect(window.locator('#layout-status')).toContainText('终端占满工作区')
    const terminalFirstWidth = (await window.locator('.terminal-column').boundingBox())?.width ?? 0
    await window.locator('[data-setting="layout"] [data-value="assistant"]').click()
    await expect(window.locator('#ai-panel')).toBeVisible()
    await expect
      .poll(async () => (await window.locator('#ai-panel').boundingBox())?.width ?? 0)
      .toBeGreaterThan(360)
    expect((await window.locator('.terminal-column').boundingBox())?.width ?? 0).toBeLessThan(
      terminalFirstWidth
    )
    await window.locator('[data-setting="layout"] [data-value="balanced"]').click()
    await expect(window.locator('#ai-panel')).toBeVisible()
    await expect(window.locator('#layout-status')).toContainText('均衡')
    await window.locator('#font-size').fill('16')
    await expect(window.locator('#font-size-value')).toHaveText('16px')
    await window.locator('#font-family').selectOption('JetBrains Mono')

    await aiToggle.uncheck()
    await metricsToggle.uncheck()
    await filesToggle.uncheck()
    await expect(window.locator('#ai-panel')).toBeHidden()
    await expect(window.locator('#widgets-panel')).toBeHidden()
    await expect(window.locator('#terminal')).toBeVisible()
    await expect
      .poll(async () => (await window.locator('#terminal').boundingBox())?.width ?? 0)
      .toBeGreaterThan(600)
    await window.locator('#top-settings').click()
    await window.locator('#terminal').click()
    await window.keyboard.type('echo panels-off')
    await window.keyboard.press('Enter')
    await expect(window.locator('.xterm-rows')).toContainText('panels-off')
    await expect(window.locator('#terminal-context')).toBeVisible()
    await expect(window.locator('#context-command')).toHaveText('echo panels-off')
    const terminalBounds = await window.locator('.terminal-column .blocks').boundingBox()
    const terminalScreenBounds = await window.locator('#terminal .xterm-screen').boundingBox()
    if (!terminalBounds || !terminalScreenBounds) throw new Error('无法读取终端显示区域')
    expect(terminalScreenBounds.y + terminalScreenBounds.height).toBeLessThanOrEqual(
      terminalBounds.y + terminalBounds.height - 8
    )

    await window.locator('#top-settings').click()
    await aiToggle.check()
    await metricsToggle.check()
    await filesToggle.check()
    await window.locator('#ai-width').fill('220')
    await window.locator('#widgets-width').fill('240')

    await window.locator('#ai-endpoint').fill(aiEndpoint)
    await window.locator('#save-ai-config').click()
    await expect(window.locator('#ai-config-status')).toContainText('AI 配置已保存')
    await expect(window.locator('body')).toHaveAttribute('data-theme', 'light')
    await window.screenshot({ path: 'test-results/unixbridge-settings.png' })
    await window.locator('#top-settings').click()

    const aiPanelBeforeDrag = await window.locator('#ai-panel').boundingBox()
    const aiHandle = await window.locator('#ai-resizer').boundingBox()
    if (!aiPanelBeforeDrag || !aiHandle) throw new Error('面板拖拽手柄不可见')
    await window.mouse.move(aiHandle.x + aiHandle.width / 2, aiHandle.y + 80)
    await window.mouse.down()
    await window.mouse.move(aiHandle.x + 35, aiHandle.y + 80)
    await window.mouse.up()
    await expect
      .poll(async () => (await window.locator('#ai-panel').boundingBox())?.width ?? 0)
      .toBeGreaterThan(aiPanelBeforeDrag.width)

    await window.locator('#ai-input').fill('测试 AI')
    await window.locator('#ai-input').press('Enter')
    await expect(window.locator('.ai-message.is-assistant').last()).toContainText('response')
    await expect(
      window.locator('.ai-message.is-assistant').last().locator('.ai-message-content strong')
    ).toHaveText('AI e2e')
    await expect(window.locator('.ai-message.is-assistant').last().locator('li')).toHaveText('response')
    await expect(window.locator('.ai-message.is-assistant').last().locator('pre code')).toHaveText(
      'echo ok'
    )

    await window.locator('#toggle-ai').click()
    await expect(window.locator('#ai-panel')).toBeHidden()
    await window.locator('#toggle-ai').click()
    await expect(window.locator('#ai-panel')).toBeVisible()

    await window.waitForFunction(
      () => (document.querySelector('.xterm-rows')?.textContent?.trim().length ?? 0) > 0
    )
    await window.screenshot({ path: 'test-results/unixbridge-workspace.png' })

    await window.locator('.session-card:has(.session-item.is-active) .session-edit').click()
    await expect(window.locator('#session-editor')).toBeVisible()
    await window.locator('#session-name').fill('开发环境')
    await window.locator('[data-color="#d78db5"]').click()
    await expect(window.locator('#session-title')).toHaveText('开发环境')
    await expect(window.locator('#workspace-title-label')).toHaveText('开发环境')
    await expect(window.locator('html')).toHaveCSS('--session-color', '#d78db5')
    await window.screenshot({ path: 'test-results/unixbridge-session-editor.png' })

    await window.locator('#terminal').click()
    await window.keyboard.type('echo unixbridge-e2e')
    await window.keyboard.press('Enter')
    await expect(window.locator('.xterm-rows')).toContainText('unixbridge-e2e')
    await window.keyboard.type('echo u')
    await expect(window.locator('#command-complete')).toContainText('echo unixbridge-e2e')
    await expect(window.locator('#command-complete')).toContainText('历史命令')
    await window.locator('#top-settings').click()
    await window.locator('#toggle-history-suggestions').click()
    await expect(window.locator('#toggle-history-suggestions')).toHaveAttribute('aria-pressed', 'false')
    await expect(window.locator('#command-complete')).toBeHidden()
    await window.locator('#toggle-command-completion').click()
    await expect(window.locator('#toggle-command-completion')).toHaveAttribute('aria-pressed', 'false')
    await expect(window.locator('#input-assist-status')).toContainText('不显示命令提示')
    await window.locator('#toggle-command-completion').click()
    await window.locator('#toggle-history-suggestions').click()
    await expect(window.locator('#command-complete')).toContainText('历史命令')
    await window.locator('#close-settings').click()
    await window.locator('#terminal').click()
    for (let index = 0; index < 6; index += 1) await window.keyboard.press('Backspace')
    const semanticTarget = `${process.cwd()}/package.json`
    await window.keyboard.type(`ls -la ${semanticTarget}`)
    await window.keyboard.press('Enter')
    const lsBlock = window.locator('.command-block', { hasText: semanticTarget }).first()
    const lsNotes = lsBlock.locator('.command-column-body')
    await expect(lsBlock.locator('.command-column-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(lsNotes).toBeHidden()
    await lsBlock.locator('.command-column-toggle').click()
    await expect(lsNotes).toContainText('权限 (mode)')
    await expect(lsNotes).toContainText('类型与权限')
    await expect(lsNotes).toContainText('硬链接数')
    await lsBlock.locator('.command-column-toggle').click()
    await expect(lsNotes).toBeHidden()
    await expect(window.locator('.xterm-rows')).not.toContainText('mode: 类型与权限')
    await expect(window.locator('.xterm-rows')).toContainText('package.json')
    await window.locator('#terminal').click()
    await window.keyboard.press('Control+g')
    await expect(lsNotes).toContainText('第 1 位表示类型')

    await window.keyboard.type(`ls -la ${semanticTarget} ?`)
    await window.keyboard.press('Enter')
    const expandedNotes = window.locator('.command-block', { hasText: semanticTarget }).nth(1).locator('.command-column-body')
    await expect(expandedNotes).toBeVisible()
    await expect(expandedNotes).toContainText('权限 (mode)')
    await expect(window.locator('.xterm-rows')).not.toContainText('权限 (mode)')
    await expect(lsNotes).toContainText('第 1 位表示类型')

    await window.keyboard.type('ps')
    await window.keyboard.press('Enter')
    const psBlock = window.locator('.command-block').filter({ has: window.locator('strong', { hasText: /^ps$/ }) })
    const psNotes = psBlock.locator('.command-column-body')
    await expect(psBlock.locator('.command-column-toggle')).toHaveAttribute('aria-expanded', 'false')
    await psBlock.locator('.command-column-toggle').click()
    await expect(psNotes).toContainText('进程号')
    await expect(psNotes).not.toContainText('硬链接数')
    await psBlock.locator('.command-column-toggle').click()
    await expect(psNotes).toBeHidden()
    await expect(expandedNotes).not.toHaveAttribute('hidden')
    await window.locator('#terminal').click()
    await window.keyboard.type('echo prompt-continues')
    await window.keyboard.press('Enter')
    await expect(window.locator('.xterm-rows')).toContainText('prompt-continues')

    const search = window.locator('#command-search')
    await search.fill('ls -la')
    await expect(window.locator('#command-search-results button').first()).toContainText('ls -la')

    await search.fill('missing-command')
    await expect(window.locator('.search-result-empty')).toBeVisible()

    await search.press('Escape')
    await expect(window.locator('#command-search-results')).toBeHidden()

    await window.locator('#sidebar-toggle').click()
    await expect(window.locator('body')).toHaveClass(/sidebar-collapsed/)
    await expect(window.locator('#sidebar-reveal')).toBeVisible()
    await window.locator('#sidebar-reveal').click()
    await expect(window.locator('body')).not.toHaveClass(/sidebar-collapsed/)
    await expect(window.locator('.sidebar')).toBeVisible()

    await window.locator('#new-session').click()
    await window.locator('#create-group').click()
    const groupedSessions = window.locator('.session-group').last().locator('.session-card')
    await expect(groupedSessions).toHaveCount(1)
    await window.locator('#new-session').click()
    await window.locator('#create-terminal').click()
    await expect(groupedSessions).toHaveCount(2)
    await window.locator('.session-group').last().locator('.group-add').click()
    await expect(window.locator('#new-session-menu')).toBeVisible()
    await window.locator('#create-terminal').click()
    await expect(groupedSessions).toHaveCount(3)

    const sessionCountBeforeDelete = await window.locator('.session-card').count()
    await window.locator('.session-card:has(.session-item.is-active) .session-remove').click()
    await expect(window.locator('.session-card')).toHaveCount(sessionCountBeforeDelete - 1)
    await expect(window.locator('#session-count')).toHaveText(String(sessionCountBeforeDelete - 1))
    await expect(window.locator('.session-item.is-active')).toHaveCount(1)
  } finally {
    await application.close()
    await new Promise<void>((resolve) => aiServer.close(() => resolve()))
    await rm(userDataDirectory, { recursive: true, force: true })
  }
})
