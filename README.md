# session-status

A Claude Code mod that keeps a **session status pane** beside the chat, styled like Claude Code's own side panels, plus a compact status line entry (`ctx 12% · 5h 4% · 7d 67% · bg 1 · agenci 2`).

UI text is in Polish.

## What it shows

- **Sesja**: model, git branch with uncommitted change count, session duration, prompt count, cost.
- **Kontekst**: context window fill with a meter and token count; *Szczegóły* expands the biggest categories, *Kompaktuj* runs `/compact`.
- **Limity**: 5-hour and weekly rate-limit windows with time to reset.
- **Zadania w tle**: background shells (with a ■ button to stop each), scheduled wakeups (`/loop`, crons), finished count.
- **Agenci**: running and recently finished subagents.
- **Aktywność**: most used tools and recently edited files.

Open the pane any time with `/status-sesji`.

## Install

At the prompt of a terminal session:

```
/plugin install session-status --marketplace viras34/claude-session-status
```

Answer `y` to add the marketplace, then pick a scope (user scope is first).

From a shell:

```bash
claude plugin install session-status --marketplace viras34/claude-session-status
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `viras34/claude-session-status`, then Add plugin.
