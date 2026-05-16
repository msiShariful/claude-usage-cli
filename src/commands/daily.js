import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost } from "../format.js";
import { printTable } from "../table.js";
import { filterByPeriod, periodLabel } from "../filters.js";

// Day-by-day rollup. Range is controlled by --since / --until; defaults to
// the last 7 days so a bare `claude-usage daily` is useful out of the box.
export function daily(records, opts = {}) {
  const { json = false, breakdown = false, since, until } = opts;

  let lo, hi;
  if (since || until) {
    const filtered = filterByPeriod(records, "all", { since, until });
    lo = since ?? minDate(filtered);
    hi = until ?? new Date().toISOString().slice(0, 10);
    records = filtered;
  } else {
    const today = new Date();
    hi = today.toISOString().slice(0, 10);
    lo = new Date(today - 6 * 86_400_000).toISOString().slice(0, 10);
    records = records.filter(r => r.ts.slice(0, 10) >= lo);
  }

  const days = enumerateDays(lo, hi);
  const byDay = {};
  for (const r of records) {
    const day = r.ts.slice(0, 10);
    if (!day || day < lo || day > hi) continue;
    byDay[day] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, byModel: {} };
    byDay[day].input      += r.usage.input_tokens ?? 0;
    byDay[day].output     += r.usage.output_tokens ?? 0;
    byDay[day].cacheRead  += r.usage.cache_read_input_tokens ?? 0;
    byDay[day].cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
    byDay[day].cost       += calcCost(r.usage, r.model);
    if (breakdown) {
      const m = (r.model || "unknown").replace(/-\d{8}$/, "");
      byDay[day].byModel[m] ??= { input: 0, output: 0, cost: 0 };
      byDay[day].byModel[m].input  += r.usage.input_tokens ?? 0;
      byDay[day].byModel[m].output += r.usage.output_tokens ?? 0;
      byDay[day].byModel[m].cost   += calcCost(r.usage, r.model);
    }
  }

  if (json) {
    console.log(JSON.stringify({
      range: { since: lo, until: hi },
      days: days.map(d => ({ date: d, ...(byDay[d] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, byModel: {} }) })),
    }, null, 2));
    return;
  }

  const label = periodLabel("all", { since: lo, until: hi });
  console.log(`\n${chalk.bold.cyan("Daily Usage")}  ${chalk.dim(label)}\n`);

  if (breakdown) {
    const rows = [];
    for (const day of days) {
      const v = byDay[day];
      if (!v || Object.keys(v.byModel).length === 0) {
        rows.push([day, chalk.dim("—"), chalk.dim("0"), chalk.dim("0"), chalk.dim("$0.0000")]);
        continue;
      }
      Object.entries(v.byModel).forEach(([m, mv], i) => {
        rows.push([
          i === 0 ? day : "",
          chalk.dim(m),
          fmtTokens(mv.input),
          fmtTokens(mv.output),
          chalk.green(fmtCost(mv.cost)),
        ]);
      });
    }
    printTable(["Date", "Model", "Input", "Output", "Est. Cost"], rows);
  } else {
    const rows = days.map(day => {
      const v = byDay[day] ?? { input: 0, output: 0, cacheRead: 0, cost: 0 };
      return [
        day,
        fmtTokens(v.input),
        fmtTokens(v.output),
        fmtTokens(v.cacheRead),
        chalk.green(fmtCost(v.cost)),
      ];
    });
    printTable(["Date", "Input", "Output", "Cache Read", "Est. Cost"], rows);
  }

  const total = days.reduce((s, d) => s + (byDay[d]?.cost ?? 0), 0);
  console.log(`\n  ${chalk.bold("Total:")} ${chalk.green.bold(fmtCost(total))}  ${chalk.dim(`(${days.length} days)`)}\n`);
}

function enumerateDays(lo, hi) {
  const out = [];
  const start = new Date(lo + "T00:00:00Z");
  const end   = new Date(hi + "T00:00:00Z");
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function minDate(records) {
  let m = null;
  for (const r of records) {
    const d = r.ts.slice(0, 10);
    if (d && (!m || d < m)) m = d;
  }
  return m ?? new Date().toISOString().slice(0, 10);
}
