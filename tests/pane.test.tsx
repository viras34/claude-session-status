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
  const GIT: Record<string, string> = {
    'rev-parse --show-toplevel': '/repo/.wt/feature\n',
    'status --porcelain=v2 --branch':
      '# branch.oid abc\n# branch.head feature-x\n# branch.upstream origin/feature-x\n# branch.ab +2 -1\n' +
      '1 .M N... 100644 100644 100644 a b src/app.ts\n? notes.md\n',
    'log -1 --format=%h%x1f%s%x1f%ct': 'abc1234\x1fNaprawa logowania\x1f4000000000\n',
    'worktree list --porcelain':
      'worktree /repo\nHEAD 1\nbranch refs/heads/main\n\nworktree /repo/.wt/feature\nHEAD 2\nbranch refs/heads/feature-x\n',
    'stash list': 'stash@{0}: WIP\n',
    'remote get-url origin': 'git@github.com:acme/app.git\n',
  }
  on('process.run', (_, e) => {
    const [tool, ...rest] = e.argv
    const stdout = tool === 'git' ? GIT[rest.join(' ')] : undefined
    return { value: { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
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
    expect(await ui.find({ type: 'Text', text: /^feature-x$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /↑2 ↓1 względem origin\/feature-x/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /worktree w repo/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Naprawa logowania/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /1 zmienionych · 1 nowych/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'git-pull' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'git-push' })).toBeTruthy()
    expect((await ui.find({ type: 'Link', text: /Gałąź na GitHubie/ }))?.props.href).toBe(
      'https://github.com/acme/app/tree/feature-x',
    )
    await ui.press({ key: 'toggle-files' })
    expect(await ui.find({ type: 'Text', text: /src\/app\.ts/ })).toBeTruthy()
    await ui.press({ key: 'toggle-files' })
    await ui.press({ key: 'details' })
    expect(await ui.find({ type: 'Text', text: /System prompt/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^60k$/ })).toBeTruthy()
    await ui.press({ key: 'details' })
    await ui.unmount()
  }
})
