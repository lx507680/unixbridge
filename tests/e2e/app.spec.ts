import { _electron as electron, expect, test } from '@playwright/test'

test('opens a terminal window and starts a PTY session', async () => {
  const application = await electron.launch({ args: ['out/main/index.js'] })
  try {
    const window = await application.firstWindow()
    await expect(window).toHaveTitle('unixbridge')
    await expect(window.locator('#terminal')).toBeVisible()
    await expect(window.locator('#session-status')).not.toHaveText('正在启动 PowerShell…', {
      timeout: 15_000
    })

    if (process.platform === 'win32') {
      await expect(window.locator('#session-status')).toContainText('PowerShell · ConPTY')
    } else {
      await expect(window.locator('#session-status')).toContainText('开发 shell · 非 ConPTY')
    }
  } finally {
    await application.close()
  }
})
