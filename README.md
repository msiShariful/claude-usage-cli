# claude-usage-cli

View your local [Claude Code](https://claude.ai/code) token usage and estimated costs from the terminal.

## Install

```bash
npm install -g claude-usage-cli
```

## Usage

```bash
claude-usage          # today's breakdown
claude-usage week     # last 7 days
claude-usage stats    # all-time totals
claude-usage projects # by project
```

## How it works

Reads and parses the JSONL session logs Claude Code writes to `~/.claude/projects/`.
No API key needed. All data stays local.