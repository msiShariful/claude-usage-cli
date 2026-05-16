import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtCost, fmtTokens, modelColor } from "../format.js";
import { renderBar } from "../table.js";
import { loadAll } from "../parser.js";

const BLOCK_MS = 5 * 60 * 60 * 1000;

function todayRecords(records) {
  const t = new Date().toISOString().slice(0, 10);
  return records.filter(r => r.ts.startsWith(t));
}

function activeBlock(records) {
  const sorted = records
    .filter(r => r.ts)
    .map(r => ({ ...r, t: Date.parse(r.ts) }))
    .filter(r => !Number.isNaN(r.t))
    .sort((a, b) => a.t - b.t);

  let cur = null;
  for (const r of sorted) {
    if (!cur || r.t >= cur.startMs + BLOCK_MS) {
      cur = { startMs: r.t, endMs: r.t + BLOCK_MS, cost: 0, turns: 0 };
    }
    cur.cost  += calcCost(r.usage, r.model);
    cur.turns += 1;
  }
  if (!cur || Date.now() >= cur.endMs) return null;
  return cur;
}

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function clear() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function render() {
  const records = loadAll();
  const todays  = todayRecords(records);
  const block   = activeBlock(records);

  const byModel = {};
  let totalCost = 0;
  for (const r of todays) {
    const m = (r.model || "unknown").replace(/-\d{8}$/, "");
    byModel[m] ??= { input: 0, output: 0, cacheRead: 0, cost: 0 };
    byModel[m].input     += r.usage.input_tokens ?? 0;
    byModel[m].output    += r.usage.output_tokens ?? 0;
    byModel[m].cacheRead += r.usage.cache_read_input_tokens ?? 0;
    const c = calcCost(r.usage, r.model);
    byModel[m].cost      += c;
    totalCost            += c;
  }

  clear();
  const now = new Date().toLocaleTimeString();
  console.log();
  console.log(`  ${chalk.bold.cyan("◈ LIVE")}  ${chalk.dim(`refreshed ${now} · Ctrl-C to exit`)}`);
  console.log();
  console.log(`  ${chalk.bold("Today")}      ${chalk.green.bold(fmtCost(totalCost))}  ${chalk.dim(`(${todays.length} turns)`)}`);

  if (block) {
    const pct      = (Date.now() - block.startMs) / BLOCK_MS * 100;
    const remain   = block.endMs - Date.now();
    const elapsedH = (Date.now() - block.startMs) / 3_600_000;
    const burn     = elapsedH > 0 ? block.cost / elapsedH : 0;
    const proj     = block.cost + burn * (remain / 3_600_000);

    console.log();
    console.log(`  ${chalk.bold.green("● Active 5h block")}`);
    console.log(`    ${chalk.dim("Spent")}      ${chalk.green.bold(fmtCost(block.cost))}  ${chalk.dim(`(${block.turns} turns)`)}`);
    console.log(`    ${chalk.dim("Progress")}   ${renderBar(pct, 24, chalk.green)} ${chalk.bold(`${pct.toFixed(0)}%`)}`);
    console.log(`    ${chalk.dim("Remaining")}  ${fmtDuration(remain)}`);
    console.log(`    ${chalk.dim("Burn rate")}  ${chalk.yellow(fmtCost(burn))}${chalk.dim("/hour")}`);
    console.log(`    ${chalk.dim("Projected")}  ${chalk.yellow.bold(fmtCost(proj))} ${chalk.dim("at window end")}`);
  } else {
    console.log(`  ${chalk.dim("No active 5-hour block")}`);
  }

  if (Object.keys(byModel).length) {
    console.log();
    console.log(`  ${chalk.bold.dim("By model")}`);
    const sorted = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
    const maxLen = Math.max(...sorted.map(([m]) => m.length));
    for (const [m, v] of sorted) {
      const cfn = modelColor(m);
      const pct = totalCost ? (v.cost / totalCost) * 100 : 0;
      console.log(
        `    ${cfn(m.padEnd(maxLen + 2))} ` +
        `${chalk.dim(fmtTokens(v.input + v.output + v.cacheRead).padEnd(8))} ` +
        `${renderBar(pct, 14, cfn)} ${cfn(`${pct.toFixed(0)}%`.padStart(4))}  ` +
        `${chalk.green(fmtCost(v.cost))}`
      );
    }
  }
  console.log();
}

export function live(_records, opts = {}) {
  const intervalSec = Number(opts.interval) || 3;
  render();
  const timer = setInterval(render, intervalSec * 1000);

  const stop = () => { clearInterval(timer); console.log(chalk.dim("\n  stopped.\n")); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
