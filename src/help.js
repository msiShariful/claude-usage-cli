import chalk from "chalk";

const b = chalk.bold;
const d = chalk.dim;
const c = chalk.cyan;

export const VERSION = "1.3.0";

export const HELP = `
${b.cyan("claude-usage")} ${d("v" + VERSION)} — Claude Code local usage & cost viewer

${b("USAGE")}
  claude-usage [command] [options]

${b("COMMANDS")}
  ${c("today")}              Today's usage broken down by model (default)
  ${c("weekly")}             Last 7 days summary  ${d("(alias: week)")}
  ${c("monthly")}            Last 30 days, grouped by month
  ${c("stats")}              All-time totals across every project
  ${c("projects")}           Cost grouped by project (sorted by spend)
  ${c("models [period]")}    Per-model usage with % share bars
  ${c("session")}            Usage grouped by session ${d("(--sort cost|recent, --limit N)")}
  ${c("blocks")}             5-hour billing windows with burn-rate & projection
  ${c("history [project]")}  Recent prompts with per-prompt cost
  ${c("live")}               Live-refreshing today view + active 5h block ${d("(Ctrl-C to exit)")}
  ${c("web")}                Open the dashboard in your browser ${d("(alias: ui, dashboard)")}

${b("OPTIONS")}
  ${c("--json")}             Emit machine-readable JSON instead of a table
  ${c("--breakdown")}        Split daily/weekly/monthly rows by model
  ${c("--since YYYY-MM-DD")} Start date for the range
  ${c("--until YYYY-MM-DD")} End date for the range
  ${c("--limit N")}          Cap rows (history default 50, session 20, blocks 10)
  ${c("--sort cost|recent")} Session sort order (default cost)
  ${c("--interval N")}       Live refresh interval in seconds (default 3)
  ${c("--port N")}            Web dashboard port (default 7777)
  ${c("--no-open")}           Don't auto-open the browser (for \`web\`)
  ${c("-h, --help")}         Show this help
  ${c("-v, --version")}      Print version

${b("PERIOD VALUES")} ${d("(for `models <period>`)")}
  today  ·  yesterday  ·  week  ·  month

${b("EXAMPLES")}
  ${d("# Quick checks")}
  claude-usage
  claude-usage weekly
  claude-usage stats

  ${d("# Drill in")}
  claude-usage models week
  claude-usage projects --json
  claude-usage history uigen

  ${d("# Date ranges")}
  claude-usage weekly --since 2026-04-01 --until 2026-04-30
  claude-usage monthly --breakdown

  ${d("# Live monitoring")}
  claude-usage live
  claude-usage blocks

  ${d("# Web dashboard")}
  claude-usage web
  claude-usage web --port 8080 --no-open

${b("DATA SOURCE")}
  Reads JSONL session logs at ${c("~/.claude/projects/")}
  No API key required · all data stays local
`;
