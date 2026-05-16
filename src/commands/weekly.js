import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost } from "../format.js";
import { printTable } from "../table.js";

export function weekly(records, { json = false, breakdown = false } = {}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  const byDay = {};
  for (const r of records) {
    const day = r.ts.slice(0, 10);
    if (!day) continue;
    byDay[day] ??= { input: 0, output: 0, cost: 0, byModel: {} };
    byDay[day].input  += r.usage.input_tokens ?? 0;
    byDay[day].output += r.usage.output_tokens ?? 0;
    byDay[day].cost   += calcCost(r.usage, r.model);
    if (breakdown) {
      const m = (r.model || "unknown").replace(/-\d{8}$/, "");
      byDay[day].byModel[m] ??= { input: 0, output: 0, cost: 0 };
      byDay[day].byModel[m].input  += r.usage.input_tokens ?? 0;
      byDay[day].byModel[m].output += r.usage.output_tokens ?? 0;
      byDay[day].byModel[m].cost   += calcCost(r.usage, r.model);
    }
  }

  if (json) {
    const data = days.map(d => ({
      date: d,
      ...(byDay[d] ?? { input: 0, output: 0, cost: 0, byModel: {} }),
    }));
    console.log(JSON.stringify({ range: { since: days[0], until: days[6] }, days: data }, null, 2));
    return;
  }

  console.log(`\n${chalk.bold.cyan("Last 7 Days")}\n`);

  if (breakdown) {
    const rows = [];
    for (const day of days) {
      const v = byDay[day];
      if (!v || Object.keys(v.byModel).length === 0) {
        rows.push([day, chalk.dim("—"), chalk.dim("0"), chalk.dim("0"), chalk.dim("$0.0000")]);
        continue;
      }
      const models = Object.entries(v.byModel);
      models.forEach(([m, mv], i) => {
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
      const v = byDay[day] ?? { input: 0, output: 0, cost: 0 };
      return [day, fmtTokens(v.input), fmtTokens(v.output), chalk.green(fmtCost(v.cost))];
    });
    printTable(["Date", "Input", "Output", "Est. Cost"], rows);
  }

  const total = days.reduce((s, d) => s + (byDay[d]?.cost ?? 0), 0);
  console.log(`\n  ${chalk.bold("Total:")} ${chalk.green.bold(fmtCost(total))}\n`);
}
