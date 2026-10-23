export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Usage = {
  tokens?: number
  window: number
  percent?: number
  limits: Limit[]
  usd?: number
  startedAt?: number
}

export type Agent = {
  id: string
  type: string
  description: string
  status: string
  name?: string
}

export type Task = {
  id: string
  type: string
  status: string
  description: string
  startedAt: number
}

export type Cron = { id: string; schedule: string; recurring: boolean; prompt: string }

export type Session = {
  model: string
  turns: number
  repo?: string
}

export type GitFile = { path: string; code: string }

export type Worktree = { path: string; branch?: string; isCurrent: boolean; isMain: boolean }

export type Commit = { hash: string; subject: string; at: number }

export type Pr = { number: number; state: string; title: string; url: string }

export type Git = {
  root: string
  branch: string
  upstream?: string
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
  conflicted: number
  files: GitFile[]
  stashes: number
  last?: Commit
  worktrees: Worktree[]
  web?: string
  pr?: Pr
  busy?: string
}

export type Category = { name: string; tokens: number }

export type Activity = { tools: Record<string, number>; files: string[] }

declare module 'claude-code' {
  interface PluginState {
    'session-status': {
      usage: Usage | null
      session: Session | null
      agents: Agent[]
      tasks: Task[]
      finished: number
      crons: Cron[]
      activity: Activity
      categories: Category[]
      isDetailed: boolean
      git: Git | null
      gitOpen: { files: boolean; worktrees: boolean }
    }
  }
}
