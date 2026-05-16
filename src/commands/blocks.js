import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost } from "../format.js";
import { printTable, renderBar } from "../table.js";

const BLOCK_MS = 5 * 60 * 60 * 1000; // 5-hour Claude Code billing window

// Group records into Claude's 5-hour billing windows.
// The first record starts a block; all records within +5h join it.
// The first record past that boundary opens the next block.
function buildBlocks(records) {
  const sorted = records
    .filter(r => r.ts)
    .map(r => ({ ...r, t: Date.parse(r.ts) }))
    .filter(r => !Number.isNaN(r.t))
    .sort((a, b) => a.t - b.t);

  const blocks = [];
  let cur = null;
  for (const r of sorted) {
    if (!cur || r.t >= cur.startMs + BLOCK_MS) {
      cur = {
        startMs: r.t,
        endMs:   r.t + BLOCK_MS,
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0,
        turns: 0, models: new Set(), lastMs: r.t,
      };
      blocks.push(cur);
    }
    cur.input      += r.usage.input_tokens ?? 0;
    cur.output     += r.usage.output_tokens ?? 0;
    cur.cacheRead  += r.usage.cache_read_input_tokens ?? 0;
    cur.cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
    cur.cost       += calcCost(r.usage, r.model);
    cur.turns      += 1;
    cur.lastMs      = r.t;
    if (r.model) cur.models.add(r.model.replace(/-\d{8}$/, ""));
  }
  return blocks;
}

function fmtBlockTime(ms) {
  const d = new Date(ms);
  const day = d.getDate();
  const mon = d.toLocaleString("en", { month: "short" });
  const hh  = String(d.getHours()).padStart(2, "0");
  const mm  = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${mon} ${hh}:${mm}`;
}

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function blocks(records, opts = {}) {
  const { json = false, limit = 10 } = opts;
  const blocksAll = buildBlocks(records);
  const now = Date.now();

  const decorated = blocksAll.map(b => {
    const active   = now < b.endMs;
    const elapsed  = Math.min(now, b.endMs) - b.startMs;
    const remaining= active ? b.endMs - now : 0;
    const burnRate = elapsed > 0 ? b.cost / (elapsed / 3_600_000) : 0; // $/hour
    const projected= active ? b.cost + burnRate * (remaining / 3_600_000) : b.cost;
    return { ...b, active, elapsed, remaining, burnRate, projected };
  });

  const recent = decorated.slice(-limit).reverse();

  if (json) {
    console.log(JSON.stringify(
      recent.map(b => ({
        start: new Date(b.startMs).toISOString(),
        end:   new Date(b.endMs).toISOString(),
        active: b.active,
        turns: b.turns,
        models: [...b.models],
        input_tokens: b.input,
        output_tokens: b.output,
        cache_read_tokens: b.cacheRead,
        cache_write_tokens: b.cacheWrite,
        cost: b.cost,
        burn_rate_per_hour: b.burnRate,
        projected_cost: b.projected,
        remaining_ms: b.remaining,
      })),
      null, 2
    ));
    return;
  }

  console.log(`\n${chalk.bold.cyan("◈ 5-HOUR BILLING BLOCKS")}  ${chalk.dim(`showing ${recent.length} of ${blocksAll.length}`)}\n`);

  if (!recent.length) {
    console.log(chalk.yellow("  No billing blocks found.\n"));
    return;
  }

  const active = decorated.find(b => b.active);
  if (active) {
    const pctElapsed = (active.elapsed / BLOCK_MS) * 100;
    console.log(chalk.bold.green("  ● ACTIVE BLOCK"));
    console.log(`    ${chalk.dim("Started")}    ${fmtBlockTime(active.startMs)}`);
    console.log(`    ${chalk.dim("Ends")}       ${fmtBlockTime(active.endMs)}  ${chalk.dim(`(in ${fmtDuration(active.remaining)})`)}`);
    console.log(`    ${chalk.dim("Progress")}   ${renderBar(pctElapsed, 24, chalk.green)} ${chalk.bold(`${pctElapsed.toFixed(0)}%`)}`);
    console.log(`    ${chalk.dim("Spent")}      ${chalk.green.bold(fmtCost(active.cost))}  ${chalk.dim(`(${active.turns} turns)`)}`);
    console.log(`    ${chalk.dim("Burn rate")}  ${chalk.yellow(fmtCost(active.burnRate))}${chalk.dim("/hour")}`);
    console.log(`    ${chalk.dim("Projected")}  ${chalk.yellow.bold(fmtCost(active.projected))} ${chalk.dim("by end of window")}`);
    console.log();
  }

  const rows = recent.map(b => [
    fmtBlockTime(b.startMs),
    fmtBlockTime(b.endMs),
    b.active ? chalk.green.bold("● live") : chalk.dim("closed"),
    String(b.turns),
    fmtTokens(b.input + b.output + b.cacheRead + b.cacheWrite),
    chalk.green(fmtCost(b.cost)),
  ]);
  printTable(["Started", "Ends", "Status", "Turns", "Tokens", "Est. Cost"], rows);
  console.log();
}
