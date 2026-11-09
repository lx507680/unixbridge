import { _electron as electron, expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { once } from 'node:events'

test('opens the Warp-like workspace and runs a command', async () => {
  const aiServer = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content: 'AI e2e response' } }] }))
  })
  aiServer.listen(0, '127.0.0.1')
  await once(aiServer, 'listening')
  const address = aiServer.address()
  if (!address || typeof address === 'string') throw new Error('无法启动 AI 测试服务')
  const aiEndpoint = `http://127.0.0.1:${address.port}/v1`

  const application = await electron.launch({ args: ['out/main/index.js'] })
  try {
    const window = await application.firstWindow()
    await expect(window).toHaveTitle('unixbridge')
    await expect(window.locator('.sidebar')).toBeVisible()
    await expect(window.locator('#terminal')).toBeVisible()
    await expect(window.locator('#session-status')).not.toHaveText('正在启动终端…', {
      timeout: 15_000
    })

    if (process.platform === 'win32') {
      await expect(window.locator('#session-status')).toContainText('PowerShell · ConPTY')
    } else {
      await expect(window.locator('#session-status')).toContainText('开发 shell · 非 ConPTY')
    }

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
    await expect(window.locator('#ai-panel')).toBeVisible()
    await expect(window.locator('#file-list .file-row').first()).toBeVisible({ timeout: 15_000 })
    await expect(window.locator('#processor-value')).not.toHaveText('--%', { timeout: 15_000 })

    await window.locator('[data-setting="theme"] [data-value="light"]').click()
    await window.locator('[data-setting="density"] [data-value="comfortable"]').click()
    await window.locator('[data-setting="layout"] [data-value="terminal"]').click()
    await expect(window.locator('body')).toHaveAttribute('data-layout', 'terminal')
    await window.locator('[data-setting="layout"] [data-value="balanced"]').click()

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
    await window.locator('#ai-form').evaluate((form: HTMLFormElement) => form.requestSubmit())
    await expect(window.locator('.ai-message.is-assistant').last()).toContainText('AI e2e response')

    await window.locator('#toggle-ai').click()
    await expect(window.locator('#ai-panel')).toBeHidden()
    await window.locator('#toggle-ai').click()
    await expect(window.locator('#ai-panel')).toBeVisible()

    await window.waitForFunction(
      () => (document.querySelector('.xterm-rows')?.textContent?.trim().length ?? 0) > 0
    )
    await window.screenshot({ path: 'test-results/unixbridge-workspace.png' })

    await window.locator('#edit-session').click()
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

    const search = window.locator('#command-search')
    await search.fill('开发环境')
    await expect(window.locator('.terminal-block')).toBeVisible()

    await search.fill('missing-command')
    await expect(window.locator('#empty-search')).toBeVisible()

    await search.press('Escape')
    await expect(window.locator('.terminal-block')).toBeVisible()
  } finally {
    await application.close()
    await new Promise<void>((resolve) => aiServer.close(() => resolve()))
  }
})
