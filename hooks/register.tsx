import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register, RenderChildren, RenderSurface } from 'claude-code'

import type { Activity, Agent, Category, Cron, Git, GitFile, Limit, Session, Task, Usage, Worktree } from '../types'

const PANE = 'session-status'
const TITLE = 'Status sesji'
const usage = atom({ plugin: 'session-status', key: 'usage' } as const, null)
const session = atom({ plugin: 'session-status', key: 'session' } as const, null)
const agents = atom({ plugin: 'session-status', key: 'agents' } as const, [])
const tasks = atom({ plugin: 'session-status', key: 'tasks' } as const, [])
const finished = atom({ plugin: 'session-status', key: 'finished' } as const, 0)
const crons = atom({ plugin: 'session-status', key: 'crons' } as const, [])
const activity = atom({ plugin: 'session-status', key: 'activity' } as const, { tools: {}, files: [] })
const categories = atom({ plugin: 'session-status', key: 'categories' } as const, [])
const isDetailed = atom({ plugin: 'session-status', key: 'isDetailed' } as const, false)
const git = atom({ plugin: 'session-status', key: 'git' } as const, null)
const gitOpen = atom({ plugin: 'session-status', key: 'gitOpen' } as const, { files: false, worktrees: false })

const ACTIVE = new Set(['pending', 'running', 'waiting', 'idle'])
const EDITING = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
const LIMIT_NAMES: Record<string, string> = {
  five_hour: 'Okno 5h',
  seven_day: 'Tydzień',
  seven_day_opus: 'Tydzień · Opus',
  seven_day_sonnet: 'Tydzień · Sonnet',
  spend_limit: 'Budżet',
}

// Kolory wykresów: Svg rysuje się jako obrazek, więc nie dziedziczy motywu.
const MUTED = '#8b8b8b'
const TRACK = '#8b8b8b33'
const fillOf = (percent: number) => (percent >= 90 ? '#e5534b' : percent >= 70 ? '#d4a72c' : '#4b7cf3')
const toneOf = (percent: number) => (percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'subtle')

const ICONS = {
  model: '<rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M6 2v2M10 2v2M6 12v2M10 12v2M2 6h2M2 10h2M12 6h2M12 10h2"/>',
  branch: '<circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="6" r="1.5"/><path d="M5 5.5v5M11 7.5c0 2-2 2.5-6 3"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
  cost: '<path d="M10.5 5.5c-.4-.9-1.3-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2.1-.6-2.5-1.5M8 2.5v11"/>',
  chat: '<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11h.5"/>',
  shell: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 7l2 1.5L5 10M8.5 10.5H11"/>',
  done: '<path d="M2 8.5l3.5 3.5L14 4"/>',
  cron: '<path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5M13.5 2.5v3h-3"/><path d="M8 5.5V8l1.5 1"/>',
  agent: '<rect x="3" y="5" width="10" height="8" rx="2"/><path d="M8 5V2.5M6 9h.01M10 9h.01"/>',
  file: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
  tool: '<path d="M10 2.5a3 3 0 0 0-3 4L2.5 11 5 13.5 9.5 9a3 3 0 0 0 4-3l-2 .5-1-1 .5-2z"/>',
  worktree: '<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/><path d="M6 8h4M8 6v4"/>',
  commit: '<circle cx="8" cy="8" r="2.5"/><path d="M2 8h3.5M10.5 8H14"/>',
  stash: '<path d="M2.5 9.5v3h11v-3M5 7l3 3 3-3M8 2.5V10"/>',
  pr: '<circle cx="4.5" cy="4" r="1.5"/><circle cx="4.5" cy="12" r="1.5"/><circle cx="11.5" cy="12" r="1.5"/><path d="M4.5 5.5v5M11.5 10.5V6.5a2 2 0 0 0-2-2H7M8.5 3 7 4.5 8.5 6"/>',
  warn: '<path d="M8 2.5 14 13H2z"/><path d="M8 7v2.5M8 11.2h.01"/>',
} as const
type IconName = keyof typeof ICONS

type Draw = { els: ElementTable; surface: RenderSurface }

// Odstępy w komórkach; terminal dostaje ciaśniejsze, bo pusty wiersz zajmuje całą linię.
const gapOf = ({ surface }: Draw, rich: number, cells: number) => (surface === 'terminal' ? cells : rich)
const svgOf = ({ els, surface }: Draw) => (surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined)
const kTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
const basename = (path: string) => path.split('/').pop() ?? path

function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${rest}m`
  return `${rest}m`
}

function resetIn(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms)) return undefined
  return ms <= 0 ? 'reset teraz' : `reset za ${duration(ms)}`
}

function Icon(draw: Draw, name: IconName) {
  const Svg = svgOf(draw)
  if (!Svg) return null
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${MUTED}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  return <Svg source={source} alt="" width={16} height={16} />
}

function Dot(draw: Draw, isRunning: boolean) {
  const Svg = svgOf(draw)
  const { els } = draw
  if (!Svg) return <els.Text color={isRunning ? 'success' : 'warning'}>●</els.Text>
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.5" fill="${isRunning ? '#3fb950' : '#d4a72c'}"/></svg>`
  return <Svg source={source} alt="" width={16} height={16} />
}

function Meter(draw: Draw, percent: number) {
  const clamped = Math.min(100, Math.max(0, percent))
  const Svg = svgOf(draw)
  const { els } = draw
  if (!Svg) {
    const filled = Math.round(clamped / 10)
    return (
      <els.Text color={toneOf(percent)}>
        {'━'.repeat(filled)}
        <els.Text dimColor>{'━'.repeat(10 - filled)}</els.Text>
      </els.Text>
    )
  }
  const width = Math.max(clamped > 0 ? 6 : 0, Math.round((clamped / 100) * 52))
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="8" viewBox="0 0 52 8"><rect width="52" height="8" rx="4" fill="${TRACK}"/><rect width="${width}" height="8" rx="4" fill="${fillOf(percent)}"/></svg>`
  return <Svg source={source} alt={`${Math.round(percent)}%`} width={52} height={8} />
}

function Card(draw: Draw, title: string, right: RenderChildren, children: RenderChildren[]) {
  const { Box, Text } = draw.els
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderDimColor
      paddingX={gapOf(draw, 1, 1)}
      paddingY={gapOf(draw, 1, 0)}
      gap={gapOf(draw, 1, 0)}
      marginBottom={gapOf(draw, 1, 0)}
    >
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={gapOf(draw, 1, 1)}>
        <Text bold>
          {title}
        </Text>
        {right ?? null}
      </Box>
      {children}
    </Box>
  )
}

function Row(draw: Draw, icon: IconName | null, label: string, right?: RenderChildren, sub?: string) {
  const { Box, Text } = draw.els
  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={gapOf(draw, 1, 1)}>
      <Box flexDirection="row" alignItems="center" gap={gapOf(draw, 1, 1)} flexShrink={1} minWidth={0}>
        {icon ? Icon(draw, icon) : null}
        <Box flexDirection="column" flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">{label}</Text>
          {sub ? (
            <Text dimColor wrap="truncate-end">
              {sub}
            </Text>
          ) : null}
        </Box>
      </Box>
      {right ?? null}
    </Box>
  )
}

function Value(draw: Draw, text: string) {
  const { Text } = draw.els
  return (
    <Text dimColor>
      {text}
    </Text>
  )
}

function Gauge(draw: Draw, percent: number) {
  const { Box, Text } = draw.els
  return (
    <Box flexDirection="row" alignItems="center" gap={gapOf(draw, 1, 1)}>
      <Text color={toneOf(percent)} dimColor={percent < 70}>
        {Math.round(percent)}%
      </Text>
      {Meter(draw, percent)}
    </Box>
  )
}

// Udział kategorii w oknie kontekstu: tokeny i ten sam pasek co w nagłówku karty.
function Share(draw: Draw, tokens: number, window: number) {
  const { Box, Text } = draw.els
  return (
    <Box flexDirection="row" alignItems="center" gap={gapOf(draw, 1, 1)}>
      <Text dimColor>{kTokens(tokens)}</Text>
      {Meter(draw, window > 0 ? (tokens / window) * 100 : 0)}
    </Box>
  )
}

function changesOf(g: Git): string {
  const parts: string[] = []
  if (g.staged) parts.push(`${g.staged} w indeksie`)
  if (g.unstaged) parts.push(`${g.unstaged} zmienionych`)
  if (g.untracked) parts.push(`${g.untracked} nowych`)
  return parts.length > 0 ? parts.join(' · ') : 'Brak zmian'
}

function syncOf(g: Git): string {
  if (!g.upstream) return 'bez upstreamu'
  if (!g.ahead && !g.behind) return `zgodna z ${g.upstream}`
  return `↑${g.ahead} ↓${g.behind} względem ${g.upstream}`
}

function GitCard($: EngineInterface, draw: Draw, g: Git, open: { files: boolean; worktrees: boolean }, now: number) {
  const { Box, Text, Button, Link } = draw.els
  const here = g.worktrees.find(w => w.isCurrent)
  const main = g.worktrees.find(w => w.isMain)
  const isWorktree = here !== undefined && !here.isMain
  const dirty = g.staged + g.unstaged + g.untracked + g.conflicted
  const canPush = g.ahead > 0 || (!g.upstream && g.branch !== 'HEAD')
  const pushArgs = g.upstream ? ['push'] : ['push', '-u', 'origin', g.branch]
  const others = g.worktrees.filter(w => !w.isCurrent)
  // Linki do gałęzi tylko, gdy istnieje na origin: lokalnej gałęzi bez upstreamu GitHub nie zna.
  const remote = g.upstream?.startsWith('origin/') ? g.upstream.slice(7) : undefined

  return Card(draw, 'Git', g.busy ? Value(draw, `${g.busy}…`) : Value(draw, basename(main?.path ?? g.root)), [
    Row(
      draw,
      'branch',
      g.branch,
      <Button
        key="copy-branch"
        label="⧉"
        plain
        dimColor
        onPress={press => void $.ui.copy({ text: g.branch, surface: press.surface })}
      />,
      syncOf(g),
    ),
    g.worktrees.length > 1 || isWorktree
      ? Row(
          draw,
          'worktree',
          isWorktree ? basename(g.root) : 'Główne repozytorium',
          <Button
            key="toggle-worktrees"
            label={`${g.worktrees.length} worktree`}
            plain
            dimColor
            onPress={() => quiet(toggleGit($, 'worktrees'))}
          />,
          isWorktree ? `worktree w ${basename(main?.path ?? '')}` : g.root,
        )
      : null,
    ...(open.worktrees
      ? others.map(w =>
          Row(
            draw,
            null,
            `   ${w.branch ?? '(detached)'}`,
            <Button
              key={`copy-${w.path}`}
              label="⧉"
              plain
              dimColor
              onPress={press => void $.ui.copy({ text: w.path, surface: press.surface })}
            />,
            `   ${w.isMain ? 'główne · ' : ''}${basename(w.path)}`,
          ),
        )
      : []),
    g.last
      ? Row(draw, 'commit', g.last.subject, undefined, `${g.last.hash} · ${duration(now - g.last.at)} temu`)
      : null,
    Row(
      draw,
      'file',
      changesOf(g),
      dirty > 0 ? (
        <Button
          key="toggle-files"
          label={open.files ? 'Ukryj' : 'Pliki'}
          plain
          dimColor
          onPress={() => quiet(toggleGit($, 'files'))}
        />
      ) : undefined,
    ),
    ...(open.files
      ? g.files.slice(0, 12).map(f => (
          <Box flexDirection="row" gap={gapOf(draw, 1, 1)}>
            <Text color={f.code === 'U' ? 'error' : f.code === '??' ? 'subtle' : 'warning'}>{f.code.padEnd(2)}</Text>
            <Text dimColor wrap="truncate-start">
              {f.path}
            </Text>
          </Box>
        ))
      : []),
    open.files && g.files.length > 12 ? <Text dimColor>i {g.files.length - 12} więcej</Text> : null,
    g.conflicted > 0 ? Row(draw, 'warn', `${g.conflicted} konfliktów do rozwiązania`) : null,
    g.stashes > 0 ? Row(draw, 'stash', 'Stash', Value(draw, `${g.stashes}`)) : null,
    g.pr ? Row(draw, 'pr', `#${g.pr.number} ${g.pr.title}`, Value(draw, g.pr.state.toLowerCase())) : null,
    <Box flexDirection="row" gap={gapOf(draw, 1, 1)} flexWrap="wrap">
      <Button key="git-fetch" label="Fetch" variant="secondary" onPress={() => quiet(runGit($, 'Fetch', ['fetch', '--prune']))} />
      {g.behind > 0 ? (
        <Button key="git-pull" label={`Pull ↓${g.behind}`} variant="secondary" onPress={() => quiet(runGit($, 'Pull', ['pull', '--ff-only']))} />
      ) : null}
      {canPush ? (
        <Button
          key="git-push"
          label={g.upstream ? `Push ↑${g.ahead}` : 'Publikuj gałąź'}
          variant="secondary"
          onPress={() => quiet(runGit($, 'Push', pushArgs))}
        />
      ) : null}
      {others.length > 0 && open.worktrees ? (
        <Button key="git-prune" label="Prune worktree" variant="secondary" onPress={() => quiet(runGit($, 'Prune', ['worktree', 'prune', '-v']))} />
      ) : null}
    </Box>,
    g.web ? (
      <Box flexDirection="row" gap={gapOf(draw, 2, 2)} flexWrap="wrap">
        {g.pr ? (
          <Link href={g.pr.url} label={`Otwórz PR #${g.pr.number}`} />
        ) : remote ? (
          <Link href={`${g.web}/compare/${remote}?expand=1`} label="Utwórz PR" />
        ) : null}
        {remote ? (
          <Link href={`${g.web}/tree/${remote}`} label="Gałąź na GitHubie" />
        ) : (
          <Link href={g.web} label="Repozytorium na GitHubie" />
        )}
      </Box>
    ) : null,
  ])
}

function statusLine(u: Usage | null, agentList: Agent[], taskList: Task[]): string | undefined {
  if (!u) return undefined
  const parts: string[] = []
  if (u.percent !== undefined) parts.push(`ctx ${u.percent}%`)
  for (const limit of u.limits) {
    const short = limit.kind === 'five_hour' ? '5h' : limit.kind === 'seven_day' ? '7d' : limit.kind
    parts.push(`${short} ${Math.round(limit.percentUsed)}%`)
  }
  const live = agentList.filter(a => ACTIVE.has(a.status)).length
  if (taskList.length > 0) parts.push(`bg ${taskList.length}`)
  if (live > 0) parts.push(`agenci ${live}`)
  return parts.join(' · ')
}

async function refresh($: EngineInterface): Promise<void> {
  const [measured, list] = await Promise.all([$.session.usage(), $.agent.list()])
  const next: Usage = {
    tokens: measured.context.tokens,
    window: measured.context.window,
    percent: measured.context.percent,
    limits: measured.rateLimits.map(
      (r): Limit => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt }),
    ),
    usd: measured.cost?.usd,
    startedAt: measured.startedAt,
  }
  const agentList = list.map(
    (a): Agent => ({ id: a.id, type: a.type, description: a.description, status: a.status, name: a.name }),
  )
  await update($, usage, () => next)
  await update($, agents, () => agentList)
  if (await read($, isDetailed)) await refreshCategories($)
  $.ui.status(statusLine(next, agentList, await read($, tasks)))
}

async function refreshSession($: EngineInterface): Promise<void> {
  const [model, turns, repo] = await Promise.all([$.session.model(), $.session.turns(), $.session.repo()])
  const info: Session = { model, turns, repo: repo?.name ?? undefined }
  await update($, session, () => info)
}

function parseStatus(text: string) {
  const out = { branch: 'HEAD', upstream: undefined as string | undefined, ahead: 0, behind: 0 }
  const counts = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 }
  const files: GitFile[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('# branch.head ')) out.branch = line.slice(14)
    else if (line.startsWith('# branch.upstream ')) out.upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const [a, b] = line.slice(12).split(' ')
      out.ahead = Number(a?.slice(1) ?? 0)
      out.behind = Number(b?.slice(1) ?? 0)
    } else if (line.startsWith('? ')) {
      counts.untracked += 1
      files.push({ path: line.slice(2), code: '??' })
    } else if (line.startsWith('u ')) {
      counts.conflicted += 1
      files.push({ path: line.split(' ').slice(10).join(' '), code: 'U' })
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const parts = line.split(' ')
      const xy = parts[1] ?? '..'
      if (xy[0] !== '.') counts.staged += 1
      if (xy[1] !== '.') counts.unstaged += 1
      const path = parts.slice(line.startsWith('1 ') ? 8 : 9).join(' ').split('\t')[0] ?? ''
      files.push({ path, code: xy.replace(/\./g, ' ').trim() })
    }
  }
  return { ...out, ...counts, files }
}

function parseWorktrees(text: string, root: string): Worktree[] {
  return text
    .split('\n\n')
    .map(block => block.split('\n'))
    .filter(lines => lines[0]?.startsWith('worktree '))
    .map((lines, i): Worktree => {
      const path = lines[0]?.slice(9) ?? ''
      const ref = lines.find(l => l.startsWith('branch '))?.slice(7)
      return { path, branch: ref?.replace('refs/heads/', ''), isCurrent: path === root, isMain: i === 0 }
    })
}

function webOf(remote: string): string | undefined {
  const match = remote.trim().match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/)
  return match ? `https://github.com/${match[1]}/${match[2]}` : undefined
}

async function refreshGit($: EngineInterface): Promise<void> {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { timeoutMs: 5000 })
  if (top.exitCode !== 0) {
    await update($, git, () => null)
    return
  }
  const root = top.stdout.trim()
  const [status, last, trees, stash, remote] = await Promise.all([
    $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { timeoutMs: 5000 }),
    $.process.run(['git', 'log', '-1', '--format=%h%x1f%s%x1f%ct'], { timeoutMs: 5000 }),
    $.process.run(['git', 'worktree', 'list', '--porcelain'], { timeoutMs: 5000 }),
    $.process.run(['git', 'stash', 'list'], { timeoutMs: 5000 }),
    $.process.run(['git', 'remote', 'get-url', 'origin'], { timeoutMs: 5000 }),
  ])
  const parsed = parseStatus(status.stdout)
  const [hash, subject, at] = last.stdout.trim().split('\x1f')
  await update($, git, (old): Git => ({
    root,
    ...parsed,
    stashes: stash.stdout.split('\n').filter(l => l.trim()).length,
    last: hash ? { hash, subject: subject ?? '', at: Number(at) * 1000 } : undefined,
    worktrees: trees.exitCode === 0 ? parseWorktrees(trees.stdout, root) : [],
    web: remote.exitCode === 0 ? webOf(remote.stdout) : undefined,
    pr: old?.branch === parsed.branch ? old.pr : undefined,
    busy: old?.busy,
  }))
}

// gh bywa wolny i może go nie być: PR odświeżamy rzadziej i bez błędu, gdy się nie uda.
async function refreshPr($: EngineInterface): Promise<void> {
  const view = await $.process.run(['gh', 'pr', 'view', '--json', 'number,state,title,url'], { timeoutMs: 10000 })
  const pr = view.exitCode === 0 ? (JSON.parse(view.stdout) as Git['pr']) : undefined
  await update($, git, old => (old ? { ...old, pr } : old))
}

async function runGit($: EngineInterface, label: string, args: string[]): Promise<void> {
  await update($, git, old => (old ? { ...old, busy: label } : old))
  try {
    const ran = await $.process.run(['git', ...args], { timeoutMs: 120000 })
    const said = (ran.exitCode === 0 ? ran.stdout || ran.stderr : ran.stderr || ran.stdout).trim().split('\n')
    const line = said[said.length - 1] ?? ''
    $.ui.toast(ran.exitCode === 0 ? `${label}: ${line || 'gotowe'}` : `${label} nie powiódł się: ${line}`)
  } finally {
    await update($, git, old => (old ? { ...old, busy: undefined } : old))
    await refreshGit($)
  }
}

async function toggleGit($: EngineInterface, part: 'files' | 'worktrees'): Promise<void> {
  await update($, gitOpen, open => ({ ...open, [part]: !open[part] }))
}

async function refreshCategories($: EngineInterface): Promise<void> {
  const measured = await $.session.usage({ breakdown: 'summary' })
  const rows = (measured.context.breakdown?.categories ?? [])
    .filter(c => c.kind === 'used' && c.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 6)
    .map((c): Category => ({ name: c.name, tokens: c.tokens }))
  await update($, categories, () => rows)
}

async function stopTask($: EngineInterface, id: string): Promise<void> {
  const ran = await $.tool.call({ tool: 'TaskStop', task_id: id })
  if ('deny' in ran && ran.deny) {
    $.ui.toast(`Nie zatrzymano: ${ran.deny}`)
    return
  }
  await update($, tasks, list => list.filter(t => t.id !== id))
  await update($, finished, n => n + 1)
}

async function compact($: EngineInterface): Promise<void> {
  try {
    const { skip } = await $.session.compact()
    if (skip) $.ui.toast('Kompaktowanie wstrzymane przez hook')
  } catch {
    $.ui.toast('Kompaktuj po zakończeniu tury')
  }
}

async function toggleDetails($: EngineInterface): Promise<void> {
  const isOn = !(await read($, isDetailed))
  await update($, isDetailed, () => isOn)
  if (isOn) await refreshCategories($)
}

const quiet = (work: Promise<void>) => void work.catch(() => undefined)

export const register: Register = on => {
  let fast: { cancel: () => void } | undefined
  let slow: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'status-sesji',
      description: 'Pokaż panel ze statusem sesji: kontekst, limity, zadania w tle, agenci',
    })
    void $.ui.open({ id: PANE, title: TITLE })
    fast?.cancel()
    slow?.cancel()
    fast = $.clock.every(5000, () => quiet(refresh($)))
    slow = $.clock.every(20000, () => {
      quiet(refreshSession($))
      quiet(refreshGit($))
    })
    quiet(refresh($))
    quiet(refreshSession($))
    quiet(refreshGit($).then(() => refreshPr($)))

    return started
  })

  on('command.run', { command: 'status-sesji' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    quiet(refresh($))
    quiet(refreshSession($))
    quiet(refreshGit($).then(() => refreshPr($)))

    return { text: 'Panel statusu sesji otwarty.' }
  })

  on('session.measure', async ($, e, next) => {
    quiet(refresh($))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const ran = await next(e)
    quiet(refreshSession($))

    return ran
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId) return ran

    const path = 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : undefined
    await update($, activity, (a): Activity => ({
      tools: { ...a.tools, [e.tool]: (a.tools[e.tool] ?? 0) + 1 },
      files: EDITING.has(e.tool) && path ? [path, ...a.files.filter(f => f !== path)].slice(0, 30) : a.files,
    }))

    if (e.tool === 'Bash' && e.run_in_background && 'result' in ran && ran.result) {
      const id = (ran.result as { backgroundTaskId?: string }).backgroundTaskId
      if (id) {
        const task: Task = {
          id,
          type: 'shell',
          status: 'running',
          description: e.description ?? e.command.slice(0, 120),
          startedAt: await $.clock.now(),
        }
        await update($, tasks, list => [...list.filter(t => t.id !== id), task])
      }
    }
    if (e.tool === 'Bash' || EDITING.has(e.tool)) quiet(refreshGit($))
    if (e.tool === 'TaskStop' && e.task_id) {
      const id = e.task_id
      await update($, tasks, list => list.filter(t => t.id !== id))
    }
    $.ui.status(statusLine(await read($, usage), await read($, agents), await read($, tasks)))

    return ran
  })

  // Pełna lista pracy w tle przychodzi z końcem tury: czego tam brak, to się skończyło.
  on('classic.Stop', async ($, e, next) => {
    const now = await $.clock.now()
    const known = await read($, tasks)
    const live = (e.background_tasks ?? []).filter(t => t.type !== 'subagent')
    const liveIds = new Set(live.map(t => t.id))
    const ended = known.filter(t => !liveIds.has(t.id)).length
    await update($, tasks, () =>
      live.map(
        (t): Task => ({
          id: t.id,
          type: t.type,
          status: t.status,
          description: t.description || t.command || t.id,
          startedAt: known.find(k => k.id === t.id)?.startedAt ?? now,
        }),
      ),
    )
    if (ended > 0) await update($, finished, n => n + ended)
    await update($, crons, () =>
      (e.session_crons ?? []).map(
        (c): Cron => ({ id: c.id, schedule: c.schedule, recurring: c.recurring, prompt: c.prompt }),
      ),
    )
    quiet(refresh($))
    quiet(refreshSession($))
    quiet(refreshGit($).then(() => refreshPr($)))

    return next(e)
  })

  on('session.end', ($, e, next) => {
    fast?.cancel()
    slow?.cancel()
    fast = undefined
    slow = undefined

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const draw: Draw = { els, surface: e.surface }
    const { Box, Text, Button } = els
    const [u, info, agentList, taskList, done, cronList, act, cats, detailed, now] = await Promise.all([
      read($, usage),
      read($, session),
      read($, agents),
      read($, tasks),
      read($, finished),
      read($, crons),
      read($, activity),
      read($, categories),
      read($, isDetailed),
      $.clock.now(),
    ])
    const [repoGit, open] = await Promise.all([read($, git), read($, gitOpen)])

    const live = agentList.filter(a => ACTIVE.has(a.status))
    const ended = agentList.filter(a => !ACTIVE.has(a.status)).slice(-4).reverse()
    const toolTotal = Object.values(act.tools).reduce((sum, n) => sum + n, 0)
    const topTools = Object.entries(act.tools)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)

    const sessionCard = Card(draw, 'Sesja', info?.repo ? Value(draw, info.repo) : null, [
      Row(draw, 'model', info?.model ?? '…'),
      Row(draw, 'clock', 'Czas trwania', Value(draw, u?.startedAt ? duration(now - u.startedAt) : '—')),
      Row(draw, 'chat', 'Prompty', Value(draw, `${info?.turns ?? 0}`)),
      u?.usd !== undefined ? Row(draw, 'cost', 'Koszt', Value(draw, `$${u.usd.toFixed(2)}`)) : null,
    ])

    const contextCard = Card(
      draw,
      'Kontekst',
      u?.percent !== undefined ? Gauge(draw, u.percent) : Value(draw, '—'),
      [
        <Text dimColor>
          {u?.tokens !== undefined
            ? `${kTokens(u.tokens)} z ${kTokens(u.window)} tokenów`
            : 'odczyt po pierwszej odpowiedzi'}
        </Text>,
        ...(detailed ? cats.map(c => Row(draw, null, c.name, Share(draw, c.tokens, u?.window ?? 0))) : []),
        <Box flexDirection="row" gap={gapOf(draw, 1, 1)}>
          <Button
            key="details"
            label={detailed ? 'Ukryj szczegóły' : 'Szczegóły'}
            variant="secondary"
            onPress={() => quiet(toggleDetails($))}
          />
          <Button key="compact" label="Kompaktuj" variant="secondary" onPress={() => quiet(compact($))} />
        </Box>,
      ],
    )

    const limitsCard =
      u && u.limits.length > 0
        ? Card(
            draw,
            'Limity',
            null,
            u.limits.map(limit =>
              Row(
                draw,
                null,
                LIMIT_NAMES[limit.kind] ?? limit.kind,
                Gauge(draw, limit.percentUsed),
                resetIn(limit.resetsAt, now),
              ),
            ),
          )
        : null

    const isIdle = taskList.length === 0 && done === 0 && cronList.length === 0
    const tasksCard = Card(
      draw,
      'Zadania w tle',
      taskList.length > 0 ? Value(draw, `${taskList.length} w toku`) : null,
      [
        isIdle ? (
          <Text dimColor>
            Nic nie działa w tle
          </Text>
        ) : null,
        ...taskList.map(t =>
          Row(
            draw,
            'shell',
            t.description,
            <Button key={`stop-${t.id}`} label="■" plain dimColor onPress={() => quiet(stopTask($, t.id))} />,
            `${t.type} · ${duration(now - t.startedAt)}`,
          ),
        ),
        ...cronList.map(c =>
          Row(draw, 'cron', c.prompt.split('\n')[0] ?? c.id, Value(draw, c.recurring ? c.schedule : 'raz')),
        ),
        done > 0 ? Row(draw, 'done', `${done} zakończonych`) : null,
      ],
    )

    const agentsCard = Card(draw, 'Agenci', live.length > 0 ? Value(draw, `${live.length} aktywnych`) : null, [
      agentList.length === 0 ? (
        <Text dimColor>
          Brak agentów w tej sesji
        </Text>
      ) : null,
      ...live.map(a => (
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={gapOf(draw, 1, 1)}>
          <Box flexDirection="row" alignItems="center" gap={gapOf(draw, 1, 1)} flexShrink={1} minWidth={0}>
            {Dot(draw, a.status === 'running')}
            <Box flexDirection="column" flexShrink={1} minWidth={0}>
              <Text wrap="truncate-end">{a.description || a.type}</Text>
              <Text dimColor wrap="truncate-end">
                {a.name ?? a.type}
              </Text>
            </Box>
          </Box>
          {Value(draw, a.status)}
        </Box>
      )),
      ...ended.map(a => Row(draw, 'done', a.description || a.type, Value(draw, a.status))),
    ])

    const activityCard =
      toolTotal > 0
        ? Card(draw, 'Aktywność', Value(draw, `${toolTotal} wywołań`), [
            Row(draw, 'tool', topTools.map(([name, n]) => `${name} ${n}`).join(' · ')),
            ...act.files.slice(0, 5).map(f => Row(draw, 'file', basename(f), undefined, f)),
            act.files.length > 5 ? (
              <Text dimColor>
                i {act.files.length - 5} więcej plików
              </Text>
            ) : null,
          ])
        : null

    return (
      <Box flexDirection="column">
        {sessionCard}
        {repoGit ? GitCard($, draw, repoGit, open, now) : null}
        {contextCard}
        {limitsCard}
        {tasksCard}
        {agentsCard}
        {activityCard}
      </Box>
    )
  })
}
