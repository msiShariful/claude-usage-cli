import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost } from "../format.js";
import { filterByPeriod, periodLabel } from "../filters.js";

export function stats(records, opts = {}) {
  const { json = false, since, until } = opts;
  records = filterByPeriod(records, "all", { since, until });
  const rangeLabel = periodLabel("all", { since, until });
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, totalCost = 0;
  const models = new Set(), projects = new Set(), sessions = new Set();

  for (const r of records) {
    input     += r.usage.input_tokens ?? 0;
    output    += r.usage.output_tokens ?? 0;
    cacheRead += r.usage.cache_read_input_tokens ?? 0;
    cacheWrite+= r.usage.cache_creation_input_tokens ?? 0;
    totalCost += calcCost(r.usage, r.model);
    if (r.model)   models.add(r.model.replace(/-\d{8}$/, ""));
    if (r.project) projects.add(r.project);
    if (r.session) sessions.add(r.session);
  }

  if (json) {
    console.log(JSON.stringify({
      range: rangeLabel,
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: cacheRead,
      cache_write_tokens: cacheWrite,
      total_cost: totalCost,
      models: [...models].sort(),
      project_count: projects.size,
      session_count: sessions.size,
    }, null, 2));
    return;
  }

  console.log(`\n${chalk.bold.cyan("Stats")}  ${chalk.dim(rangeLabel)}\n`);
  const rows = [
    ["Total Input Tokens",    fmtTokens(input)],
    ["Total Output Tokens",   fmtTokens(output)],
    ["Cache Read Tokens",     fmtTokens(cacheRead)],
    ["Cache Write Tokens",    fmtTokens(cacheWrite)],
    ["Est. Total Cost",       chalk.green.bold(fmtCost(totalCost))],
    ["Models Used",           [...models].sort().join(", ") || "n/a"],
    ["Projects Tracked",      String(projects.size)],
    ["Total Sessions",        String(sessions.size)],
  ];
  for (const [label, val] of rows) {
    console.log(`  ${chalk.bold(label.padEnd(26))} ${val}`);
  }
  console.log();
}
