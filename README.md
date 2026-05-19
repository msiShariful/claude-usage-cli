# claude-usage-cli

> Local-first usage, cost, and burn-rate analytics for [Claude Code](https://claude.ai/code) — straight from your terminal.

[![npm version](https://img.shields.io/npm/v/@msishariful/claude-usage-cli.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/@msishariful/claude-usage-cli)
[![npm downloads](https://img.shields.io/npm/dt/@msishariful/claude-usage-cli.svg)](https://www.npmjs.com/package/@msishariful/claude-usage-cli)
[![node](https://img.shields.io/node/v/@msishariful/claude-usage-cli.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@msishariful/claude-usage-cli.svg)](./LICENSE)

`claude-usage` reads the JSONL session logs that Claude Code writes to `~/.claude/projects/` and turns them into clean, color-coded tables: daily and monthly rollups, per-session and per-project breakdowns, 5-hour billing windows with burn-rate projection, a live watch view, exportable JSON, and a **full web dashboard** you can open in your browser.

**No API key. No telemetry. No network calls. Your data never leaves your machine.**

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
  - [`today`](#today)
  - [`daily`](#daily)
  - [`weekly`](#weekly)
  - [`monthly`](#monthly)
  - [`stats`](#stats)
  - [`projects`](#projects)
  - [`models`](#models)
  - [`session`](#session)
  - [`blocks`](#blocks)
  - [`history`](#history)
  - [`live`](#live)
  - [`web`](#web)
- [Global options](#global-options)
- [JSON output](#json-output)
- [How it works](#how-it-works)
- [Pricing](#pricing)
- [FAQ](#faq)
- [License](#license)

---

## Install

```bash
npm install -g @msishariful/claude-usage-cli
```

Requires Node.js 18 or newer.

Verify the install:

```bash
claude-usage --version
claude-usage --help
```

---

## Quick start

```bash
# what did I spend today?
claude-usage

# this week, day-by-day
claude-usage daily

# right now: live spend + active 5-hour block
claude-usage live

# every command's full reference
claude-usage --help
```

Every command is read-only and runs against local files in milliseconds.

---

## Commands

### `today`

Today's usage, broken down by model. The default command — running `claude-usage` with no args invokes this.

```bash
claude-usage
claude-usage today
claude-usage today --json
```

```
Today's Usage  2026-05-17

──────────────────────────────────────────────────
  Model            │  Input  │  Output  │  Cache Read  │  Est. Cost
──────────────────────────────────────────────────
  claude-opus-4-7  │  2.1K   │  220.5K  │  13.0M       │  $55.4231
──────────────────────────────────────────────────

  Total: $55.4231
```

---

### `daily`

Day-by-day rollup over a date range. Defaults to the last 7 days; pair with `--since` / `--until` for arbitrary ranges, or `--breakdown` to split each row by model.

```bash
claude-usage daily
claude-usage daily --since 2026-04-01 --until 2026-04-30
claude-usage daily --breakdown
claude-usage daily --json
```

```
Daily Usage  2026-05-10 → 2026-05-16

────────────────────────────────────────────────────────
  Date        │  Input  │  Output  │  Cache Read  │  Est. Cost
────────────────────────────────────────────────────────
  2026-05-10  │  13     │  2.7K    │  138.1K      │  $0.1249
  2026-05-11  │  14     │  1.7K    │  188.2K      │  $0.1393
  2026-05-12  │  84     │  17.6K   │  1.8M        │  $1.1080
  ...
  2026-05-16  │  2.1K   │  212.8K  │  12.6M       │  $53.4392
────────────────────────────────────────────────────────

  Total: $55.7448  (7 days)
```

---

### `weekly`

Quick last-7-days summary. Same shape as `daily` but always exactly 7 days. Alias: `week`.

```bash
claude-usage weekly
claude-usage week --breakdown
```

---

### `monthly`

Calendar-month rollup. Alias: `month`. Honors `--since` / `--until` and `--breakdown`.

```bash
claude-usage monthly
claude-usage monthly --breakdown
claude-usage monthly --since 2026-01-01
```

```
Monthly Usage  ALL TIME

─────────────────────────────────────────────────────
  Month    │  Input  │  Output  │  Cache Read  │  Est. Cost
─────────────────────────────────────────────────────
  2026-04  │  3      │  189     │  11.9K       │  $0.0403
  2026-05  │  3.5K   │  415.9K  │  28.6M       │  $78.8169
─────────────────────────────────────────────────────

  Total: $78.8572  (2 months)
```

---

### `stats`

All-time totals: input/output/cache tokens, total cost, distinct models, project & session counts. Scope it with `--since` / `--until`.

```bash
claude-usage stats
claude-usage stats --since 2026-05-01
claude-usage stats --json
```

```
Stats  ALL TIME

  Total Input Tokens         3.5K
  Total Output Tokens        415.9K
  Cache Read Tokens          28.6M
  Cache Write Tokens         1.8M
  Est. Total Cost            $78.8572
  Models Used                claude-haiku-4-5, claude-opus-4-6, claude-opus-4-7, claude-sonnet-4-6
  Projects Tracked           12
  Total Sessions             27
```

---

### `projects`

Cost grouped by project (= the directory you ran Claude Code from), sorted by spend.

```bash
claude-usage projects
claude-usage projects --since 2026-05-01 --json
```

```
Usage by Project  ALL TIME

──────────────────────────────────────────────────────────────
  Project                          │  Sessions  │  Input  │  Output  │  Est. Cost
──────────────────────────────────────────────────────────────
  /Users/sharif/Documents/Claude   │  9         │  2.3K   │  291.8K  │  $61.9420
  /Users/sharif/Documents/rust/rsy │  1         │  234    │  12.4K   │  $8.8007
  ...
──────────────────────────────────────────────────────────────
```

---

### `models`

Per-model usage with cost-share bar charts, ranked by spend.

```bash
claude-usage models                  # all-time
claude-usage models today
claude-usage models yesterday
claude-usage models week
claude-usage models month
claude-usage models --since 2026-04-01 --until 2026-04-30
```

```
┌──────────────────────────────────────────────────────────────┐
│  ◈ MODEL USAGE  ·  LAST 7 DAYS                     3 models │
└──────────────────────────────────────────────────────────────┘

  ─────────────────────────────────────────────────────────────────────
  MODEL                 TOTAL TOKENS   INPUT      OUTPUT    SHARE              COST
  ─────────────────────────────────────────────────────────────────────
  claude-opus-4-7       13.5M          2.1K       212.8K    ██████████████ 92.6%   $53.4392
  claude-sonnet-4-6     1.4M           1.1K       3.3K      █░░░░░░░░░░░░░  6.5%   $3.7468
  claude-haiku-4-5      28.6K          26         1.6K      ░░░░░░░░░░░░░░  0.9%   $0.0550
  ─────────────────────────────────────────────────────────────────────
  TOTAL                 14.9M          3.2K       217.7K                    100%   $57.2410
  ─────────────────────────────────────────────────────────────────────
```

---

### `session`

Usage grouped by individual conversation. Top 20 by cost by default; sort by recent or change the cap.

```bash
claude-usage session
claude-usage session --sort recent
claude-usage session --limit 50
claude-usage session --since 2026-05-01 --json
```

```
Sessions  20 of 27 · sorted by cost

──────────────────────────────────────────────────────────────────────
  Session   │  Project     │  Turns  │  Last Activity  │  Total Tokens  │  Est. Cost
──────────────────────────────────────────────────────────────────────
  bc545396  │  Claude      │  79     │  17 May, 04:00  │  11.9M         │  $46.0527
  42afa153  │  rustty      │  66     │  9 May, 22:57   │  4.1M          │  $8.8007
  02daf1df  │  terminal    │  26     │  9 May, 22:04   │  1.6M          │  $6.4574
  ...
```

---

### `blocks`

Claude's 5-hour billing windows with active block monitoring. Each block starts at the first turn and runs +5 hours; the active block shows elapsed/remaining time, current burn rate, and the projected end-of-window cost so you can pace yourself.

```bash
claude-usage blocks
claude-usage blocks --limit 20
claude-usage blocks --json
```

```
◈ 5-HOUR BILLING BLOCKS  showing 5 of 17

  ● ACTIVE BLOCK
    Started    17 May 02:26
    Ends       17 May 07:26  (in 2h 44m)
    Progress   ███████████░░░░░░░░░░░░░ 45%
    Spent      $20.6629  (51 turns)
    Burn rate  $9.1651/hour
    Projected  $45.8256 by end of window

  ─────────────────────────────────────────────────────────────────────
  Started       │  Ends          │  Status  │  Turns  │  Tokens  │  Est. Cost
  ─────────────────────────────────────────────────────────────────────
  17 May 02:26  │  17 May 07:26  │  ● live  │  51     │  3.9M    │  $20.6629
  16 May 21:12  │  17 May 02:12  │  closed  │  73     │  10.2M   │  $33.6659
  ...
```

---

### `history`

Recent prompts across every project, with per-prompt cost and color-coded project badges.

```bash
claude-usage history
claude-usage history my-project       # filter to one project
claude-usage history --limit 100
claude-usage history --since 2026-05-01
claude-usage history --json
```

```
  PROMPT HISTORY · 50 entries

  All  Claude  DsInJava  my-terminal  rustty  uigen  ...

  ────────────────────────────────────────────────────────────────────
  TIME             PROJECT       PROMPT                                           SESSION   COST
  ────────────────────────────────────────────────────────────────────
  17 May, 04:34    claude-usag   review existing features, organize them, ...     2a703847  $4.20
  17 May, 04:26    claude-usag   enable auto mode                                  2a703847  $0.08
  ...
```

---

### `live`

Live-refreshing dashboard that re-renders every few seconds: today's total spend, the active 5-hour block with burn-rate projection, and per-model share bars. Press **Ctrl-C** to exit. Alias: `watch`.

```bash
claude-usage live
claude-usage live --interval 5     # custom refresh interval (seconds)
```

```
  ◈ LIVE  refreshed 4:42:56 AM · Ctrl-C to exit

  Today      $55.8954  (129 turns)

  ● Active 5h block
    Spent      $22.2295  (56 turns)
    Progress   ███████████░░░░░░░░░░░░░ 46%
    Remaining  2h 43m 09s
    Burn rate  $9.7465/hour
    Projected  $48.7323 at window end

  By model
    claude-opus-4-7   13.5M    ██████████████ 100%  $55.8954
```

---

### `web`

Spin up a local dashboard that mirrors every CLI report in the browser — sidebar nav, dark theme, charts, auto-refreshing live view, and active 5-hour block monitoring. The server runs entirely on your machine; nothing is uploaded. Aliases: `ui`, `dashboard`.

```bash
claude-usage web                       # opens http://localhost:7777
claude-usage web --port 8080           # custom port
claude-usage web --no-open             # don't auto-open browser
```

What you get in the browser:

- **Today** — KPI cards + per-model breakdown with share bars
- **Live** — auto-refreshing today/burn-rate/block-progress dashboard
- **Blocks · 5h** — active block at the top, recent windows table
- **Daily / Monthly** — chartable cost-over-time + date-range filters
- **Models** — donut chart of cost share + breakdown table, per period
- **Projects** — cost-by-project with share bars
- **Sessions** — sortable by cost or recency
- **History** — recent prompts with per-prompt cost
- **All-time stats** — totals at a glance

No accounts, no telemetry. Everything stays local — the server only reads `~/.claude/projects/` and serves to `localhost`.

---

## Global options

| Flag | Where it applies | Effect |
|---|---|---|
| `--json` | every report | Emit structured JSON instead of a formatted table |
| `--since YYYY-MM-DD` | daily, monthly, models, session, projects, stats, history | Start of the date range |
| `--until YYYY-MM-DD` | daily, monthly, models, session, projects, stats, history | End of the date range |
| `--breakdown` | daily, weekly, monthly | Split each row by model |
| `--limit N` | history, session, blocks | Cap how many rows are shown |
| `--sort cost\|recent` | session | Sort order (default `cost`) |
| `--interval N` | live | Refresh interval in seconds (default `3`) |
| `--port N` | web | Web dashboard port (default `7777`) |
| `--no-open` | web | Don't auto-open the browser |
| `-h, --help` | global | Print the help reference |
| `-v, --version` | global | Print the version |

---

## JSON output

Every report supports `--json` for piping into `jq`, dashboards, or scripts:

```bash
# total spend this month, in pennies
claude-usage stats --since 2026-05-01 --json | jq '.total_cost'

# cost per project, CSV-style
claude-usage projects --json | jq -r '.[] | [.project, .cost] | @csv'

# is there an active 5-hour block right now?
claude-usage blocks --json | jq '.[] | select(.active == true)'

# top 5 most expensive sessions
claude-usage session --json | jq '.[:5]'
```

The shape mirrors the on-screen tables — see each command's output for field names.

---

## How it works

Claude Code writes a JSONL transcript for every session under `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Each line is one event — user turns, assistant turns with token-usage metadata, system events, tool calls.

`claude-usage`:

1. **Reads** every `.jsonl` file under `~/.claude/projects/`
2. **Parses** assistant turns and pulls out the `usage` block (input/output/cache tokens)
3. **Deduplicates** retried requests by their `requestId`
4. **Multiplies** tokens by per-model rates (see [Pricing](#pricing))
5. **Aggregates** and renders

No file is ever modified. No network request is ever made. Pricing data is bundled into the binary; nothing about your usage is sent anywhere.

---

## Pricing

Cost calculations use Anthropic's published per-million-token rates (April 2026):

| Model | Input | Output | Cache write | Cache read |
|---|---|---|---|---|
| Opus   | $15.00 | $75.00 | $18.75 | $1.50 |
| Sonnet | $3.00  | $15.00 | $3.75  | $0.30 |
| Haiku  | $0.80  | $4.00  | $1.00  | $0.08 |

If rates change, edit [`src/pricing.js`](./src/pricing.js) — it's the only place rates live.

---

## FAQ

**Are these costs exact?**
They're estimates. We multiply the tokens Anthropic reports in the session logs by the published per-million rates. If you're on a flat-rate plan (Claude Max), think of this as *what API usage would cost* rather than a bill.

**Where does the data come from?**
`~/.claude/projects/`. If that directory doesn't exist or is empty, every command will report "no usage found."

**Does it support OpenAI / Codex / other CLIs?**
Not currently — Claude Code only. Per-agent support is a possible future direction.

**Does it phone home?**
No. There are zero network calls. You can verify with `lsof` or by running offline.

**Can I export to CSV?**
Use `--json` and pipe through `jq`. See the [JSON output](#json-output) section for examples.

**My model name shows as `<synthetic>` — what is that?**
Claude Code emits synthetic placeholder turns (e.g. for tool-only steps). They carry zero tokens, so they don't affect cost; they're surfaced for completeness.

---

## License

[MIT](./LICENSE) © [Shariful Islam](https://github.com/msiShariful)
