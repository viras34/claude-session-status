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
  branch?: string
  repo?: string
  changed?: number
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
    }
  }
}
