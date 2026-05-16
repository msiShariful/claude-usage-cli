import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost } from "../format.js";
import { printTable } from "../table.js";
import { filterByPeriod, periodLabel } from "../filters.js";

export function projects(records, opts = {}) {
  const { json = false, since, until } = opts;
  records = filterByPeriod(records, "all", { since, until });
  const rangeLabel = periodLabel("all", { since, until });
  const byProject = {};
  for (const r of records) {
    const p = r.project;
    byProject[p] ??= { cost: 0, sessions: new Set(), input: 0, output: 0 };
    byProject[p].cost += calcCost(r.usage, r.model);
    byProject[p].sessions.add(r.session);
    byProject[p].input  += r.usage.input_tokens ?? 0;
    byProject[p].output += r.usage.output_tokens ?? 0;
  }

  const sorted = Object.entries(byProject).sort((a, b) => b[1].cost - a[1].cost);

  if (json) {
    console.log(JSON.stringify(
      sorted.map(([name, v]) => ({
        project: name,
        sessions: v.sessions.size,
        input_tokens: v.input,
        output_tokens: v.output,
        cost: v.cost,
      })),
      null, 2
    ));
    return;
  }

  console.log(`\n${chalk.bold.cyan("Usage by Project")}  ${chalk.dim(rangeLabel)}\n`);
  const rows = sorted.map(([p, v]) => [
    p.replace(/-/g, "/").slice(0, 45),
    v.sessions.size,
    fmtTokens(v.input),
    fmtTokens(v.output),
    chalk.green(fmtCost(v.cost)),
  ]);
  printTable(["Project", "Sessions", "Input", "Output", "Est. Cost"], rows);
  console.log();
}
