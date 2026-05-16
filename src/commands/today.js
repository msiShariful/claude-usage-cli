import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost } from "../format.js";
import { printTable } from "../table.js";

export function today(records, { json = false } = {}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const recs = records.filter(r => r.ts.startsWith(todayStr));

  const byModel = {};
  for (const r of recs) {
    const m = r.model || "unknown";
    byModel[m] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    byModel[m].input     += r.usage.input_tokens ?? 0;
    byModel[m].output    += r.usage.output_tokens ?? 0;
    byModel[m].cacheRead += r.usage.cache_read_input_tokens ?? 0;
    byModel[m].cacheWrite+= r.usage.cache_creation_input_tokens ?? 0;
    byModel[m].cost      += calcCost(r.usage, r.model);
  }
  const total = Object.values(byModel).reduce((s, v) => s + v.cost, 0);

  if (json) {
    console.log(JSON.stringify({
      date: todayStr,
      total_cost: total,
      models: byModel,
    }, null, 2));
    return;
  }

  console.log(`\n${chalk.bold.cyan("Today's Usage")}  ${chalk.dim(todayStr)}\n`);

  if (!recs.length) {
    console.log(chalk.yellow("  No usage found for today.\n"));
    return;
  }

  const rows = Object.entries(byModel).map(([model, v]) => [
    model.replace(/-\d{8}$/, ""),
    fmtTokens(v.input),
    fmtTokens(v.output),
    fmtTokens(v.cacheRead),
    chalk.green(fmtCost(v.cost)),
  ]);

  printTable(["Model", "Input", "Output", "Cache Read", "Est. Cost"], rows);
  console.log(`\n  ${chalk.bold("Total:")} ${chalk.green.bold(fmtCost(total))}\n`);
}
