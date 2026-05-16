import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost, fmtHistoryTime } from "../format.js";
import { printTable } from "../table.js";
import { filterByPeriod } from "../filters.js";

// Per-session rollup. Sorted by cost desc by default; pass sort=recent
// to surface the most recent conversations first.
export function session(records, opts = {}) {
  const { json = false, since, until, limit = 20, sort = "cost" } = opts;
  const filtered = filterByPeriod(records, "all", { since, until });

  const bySession = {};
  for (const r of filtered) {
    const id = r.session;
    bySession[id] ??= {
      project: r.project,
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0,
      firstTs: r.ts, lastTs: r.ts, turns: 0, models: new Set(),
    };
    const s = bySession[id];
    s.input      += r.usage.input_tokens ?? 0;
    s.output     += r.usage.output_tokens ?? 0;
    s.cacheRead  += r.usage.cache_read_input_tokens ?? 0;
    s.cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
    s.cost       += calcCost(r.usage, r.model);
    s.turns      += 1;
    if (r.model) s.models.add(r.model.replace(/-\d{8}$/, ""));
    if (r.ts < s.firstTs) s.firstTs = r.ts;
    if (r.ts > s.lastTs)  s.lastTs  = r.ts;
  }

  const sorted = Object.entries(bySession).sort((a, b) =>
    sort === "recent" ? b[1].lastTs.localeCompare(a[1].lastTs) : b[1].cost - a[1].cost
  );
  const shown = sorted.slice(0, limit);

  if (json) {
    console.log(JSON.stringify(
      shown.map(([id, v]) => ({
        session: id,
        project: v.project,
        turns: v.turns,
        first_ts: v.firstTs,
        last_ts: v.lastTs,
        models: [...v.models],
        input_tokens: v.input,
        output_tokens: v.output,
        cache_read_tokens: v.cacheRead,
        cache_write_tokens: v.cacheWrite,
        cost: v.cost,
      })),
      null, 2
    ));
    return;
  }

  console.log(`\n${chalk.bold.cyan("Sessions")}  ${chalk.dim(`${shown.length} of ${sorted.length} · sorted by ${sort}`)}\n`);

  if (!shown.length) {
    console.log(chalk.yellow("  No sessions found.\n"));
    return;
  }

  const rows = shown.map(([id, v]) => {
    const segs = (v.project ?? "").split("-").filter(Boolean);
    const projShort = segs.length ? segs[segs.length - 1].slice(0, 24) : "—";
    return [
      id.slice(0, 8),
      projShort,
      String(v.turns),
      fmtHistoryTime(v.lastTs),
      fmtTokens(v.input + v.output + v.cacheRead + v.cacheWrite),
      chalk.green(fmtCost(v.cost)),
    ];
  });
  printTable(["Session", "Project", "Turns", "Last Activity", "Total Tokens", "Est. Cost"], rows);

  const total = shown.reduce((s, [, v]) => s + v.cost, 0);
  console.log(`\n  ${chalk.bold("Subtotal:")} ${chalk.green.bold(fmtCost(total))}\n`);
}
