import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost } from "../format.js";
import { printTable } from "../table.js";
import { filterByPeriod, periodLabel } from "../filters.js";

// Month-by-month rollup. Honors --since / --until.
export function monthly(records, opts = {}) {
  const { json = false, breakdown = false, since, until } = opts;
  records = filterByPeriod(records, "all", { since, until });

  const byMonth = {};
  for (const r of records) {
    const month = r.ts.slice(0, 7); // YYYY-MM
    if (!month) continue;
    byMonth[month] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, byModel: {} };
    byMonth[month].input      += r.usage.input_tokens ?? 0;
    byMonth[month].output     += r.usage.output_tokens ?? 0;
    byMonth[month].cacheRead  += r.usage.cache_read_input_tokens ?? 0;
    byMonth[month].cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
    byMonth[month].cost       += calcCost(r.usage, r.model);
    if (breakdown) {
      const m = (r.model || "unknown").replace(/-\d{8}$/, "");
      byMonth[month].byModel[m] ??= { input: 0, output: 0, cost: 0 };
      byMonth[month].byModel[m].input  += r.usage.input_tokens ?? 0;
      byMonth[month].byModel[m].output += r.usage.output_tokens ?? 0;
      byMonth[month].byModel[m].cost   += calcCost(r.usage, r.model);
    }
  }

  const months = Object.keys(byMonth).sort();

  if (json) {
    console.log(JSON.stringify({
      range: { since, until },
      months: months.map(m => ({ month: m, ...byMonth[m] })),
    }, null, 2));
    return;
  }

  const label = periodLabel("all", { since, until });
  console.log(`\n${chalk.bold.cyan("Monthly Usage")}  ${chalk.dim(label)}\n`);

  if (!months.length) {
    console.log(chalk.yellow("  No usage found.\n"));
    return;
  }

  if (breakdown) {
    const rows = [];
    for (const month of months) {
      const v = byMonth[month];
      Object.entries(v.byModel).forEach(([m, mv], i) => {
        rows.push([
          i === 0 ? month : "",
          chalk.dim(m),
          fmtTokens(mv.input),
          fmtTokens(mv.output),
          chalk.green(fmtCost(mv.cost)),
        ]);
      });
    }
    printTable(["Month", "Model", "Input", "Output", "Est. Cost"], rows);
  } else {
    const rows = months.map(month => {
      const v = byMonth[month];
      return [
        month,
        fmtTokens(v.input),
        fmtTokens(v.output),
        fmtTokens(v.cacheRead),
        chalk.green(fmtCost(v.cost)),
      ];
    });
    printTable(["Month", "Input", "Output", "Cache Read", "Est. Cost"], rows);
  }

  const total = months.reduce((s, m) => s + byMonth[m].cost, 0);
  console.log(`\n  ${chalk.bold("Total:")} ${chalk.green.bold(fmtCost(total))}  ${chalk.dim(`(${months.length} month${months.length === 1 ? "" : "s"})`)}\n`);
}
