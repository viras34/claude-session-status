import type { SessionContextBreakdown } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'session-status',
  component: 'Pane',
  requestId: 'session-status',
  props: {
    title: 'Status sesji',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('panel pokazuje kontekst, limity, procesy i agentów', async ($, on) => {
  on('command.register', () => ({ value: { command: 'status-sesji' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.parse('2098-12-31T22:00:00Z') }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        tokens: 84000,
        window: 200000,
        percent: 42,
        breakdown: {
          categories: [
            { name: 'System prompt', tokens: 12000, color: 'x', isDeferred: false, kind: 'used' },
            { name: 'Messages', tokens: 60000, color: 'x', isDeferred: false, kind: 'used' },
          ],
        } as unknown as SessionContextBreakdown,
      },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 31.5, resetsAt: '2099-01-01T00:00:00Z' },
        { kind: 'seven_day', percentUsed: 88 },
      ],
      cost: { usd: 1.234 },
    },
  }))
  on('agent.list', () => ({
    value: [
      { id: 'a1', type: 'Explore', description: 'szuka plików', status: 'running' },
      { id: 'a2', type: 'Plan', description: 'plan', status: 'completed' },
    ],
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.turns', () => ({ value: 7 }))
  on('session.repo', () => ({ value: null }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { backgroundTaskId: 'b1' } } : { result: {} },
  )

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Serwer dev', run_in_background: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /42%/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /5h/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Serwer dev/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /szuka plików/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /claude-opus-5-5/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /reset za/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'stop-b1' })).toBeTruthy()
    await ui.press({ key: 'details' })
    expect(await ui.find({ type: 'Text', text: /System prompt/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^60k$/ })).toBeTruthy()
    await ui.press({ key: 'details' })
    await ui.unmount()
  }
})
