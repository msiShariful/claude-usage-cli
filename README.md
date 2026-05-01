# claude-usage-cli

View your local [Claude Code](https://claude.ai/code) token usage, estimated costs, and prompt history from the terminal.

## Install

```bash
npm install -g @msishariful/claude-usage-cli
```

## Usage

```bash
claude-usage                   # today's breakdown (default)
claude-usage week              # last 7 days summary
claude-usage stats             # all-time totals
claude-usage projects          # cost grouped by project
claude-usage history           # prompt history — last 50 prompts across all projects
claude-usage history <project> # prompt history filtered by project name
```

### Examples

```bash
claude-usage history uigen
claude-usage history queries
```

## Commands

| Command | Description |
|---|---|
| `today` | Token usage and cost broken down by model for today |
| `week` | Daily input/output token counts and cost for the last 7 days |
| `stats` | All-time totals: tokens, cost, models used, sessions, projects |
| `projects` | Cost and token usage grouped by project, sorted by spend |
| `history [project]` | Prompt history with timestamps, project badges, and per-prompt cost |

## How it works

Reads and parses the JSONL session logs Claude Code writes to `~/.claude/projects/`. No API key needed. All data stays local.
