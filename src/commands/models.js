import chalk from "chalk";
import { calcCost } from "../pricing.js";
import { fmtTokens, fmtCost, modelColor } from "../format.js";
import { renderBar } from "../table.js";
import { filterByPeriod, periodLabel } from "../filters.js";

export function modelUsage(records, period = "all", opts = {}) {
  const { json = false, since, until } = opts;
  const filtered = filterByPeriod(records, period, { since, until });
  const label    = periodLabel(period, { since, until });

  const byModel = {};
  for (const r of filtered) {
    const m = (r.model || "unknown").replace(/-\d{8}$/, "");
    byModel[m] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    byModel[m].input      += r.usage.input_tokens ?? 0;
    byModel[m].output     += r.usage.output_tokens ?? 0;
    byModel[m].cacheRead  += r.usage.cache_read_input_tokens ?? 0;
    byModel[m].cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
    byModel[m].cost       += calcCost(r.usage, r.model);
  }

  const sorted     = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
  const totalCost  = sorted.reduce((s, [, v]) => s + v.cost, 0);
  const totalIn    = sorted.reduce((s, [, v]) => s + v.input, 0);
  const totalOut   = sorted.reduce((s, [, v]) => s + v.output, 0);
  const totalToks  = sorted.reduce((s, [, v]) => s + v.input + v.output + v.cacheRead + v.cacheWrite, 0);
  const modelCount = sorted.length;

  if (json) {
    console.log(JSON.stringify({
      period: label,
      total_cost: totalCost,
      total_tokens: totalToks,
      models: sorted.map(([m, v]) => ({ model: m, ...v, share: totalCost ? v.cost / totalCost : 0 })),
    }, null, 2));
    return;
  }

  if (!filtered.length) {
    console.log(`\n${chalk.bold.cyan("◈ MODEL USAGE")}  ${chalk.dim("·")}  ${chalk.bold(label)}\n`);
    console.log(chalk.yellow("  No usage found for this period.\n"));
    return;
  }

  const BOX_W = 62;
  const titleCore = `◈ MODEL USAGE  ·  ${label}`;
  const countTag  = `${modelCount} model${modelCount !== 1 ? "s" : ""}`;
  const gap       = BOX_W - 2 - titleCore.length - countTag.length;

  console.log();
  console.log(chalk.dim("┌" + "─".repeat(BOX_W) + "┐"));
  console.log(
    chalk.dim("│  ") +
    chalk.bold.cyan("◈ MODEL USAGE") +
    chalk.dim("  ·  ") +
    chalk.bold.white(label) +
    " ".repeat(Math.max(1, gap)) +
    chalk.dim(countTag) +
    chalk.dim("  │")
  );
  console.log(chalk.dim("└" + "─".repeat(BOX_W) + "┘"));
  console.log();

  const W_MODEL   = Math.max(20, ...sorted.map(([m]) => m.length)) + 2;
  const W_TOTAL   = 13;
  const W_INPUT   = 10;
  const W_OUTPUT  = 10;
  const BAR_W     = 16;
  const W_PCT     = 6;
  const W_COST    = 10;

  const sepLen = 2 + W_MODEL + W_TOTAL + W_INPUT + W_OUTPUT + BAR_W + W_PCT + W_COST + 12;
  const sep    = chalk.dim("─".repeat(sepLen));

  const hdr =
    chalk.bold.dim("MODEL".padEnd(W_MODEL))       +
    chalk.bold.dim("TOTAL TOKENS".padEnd(W_TOTAL)) + "  " +
    chalk.bold.dim("INPUT".padEnd(W_INPUT))         +
    chalk.bold.dim("OUTPUT".padEnd(W_OUTPUT))       + "  " +
    chalk.bold.dim("SHARE".padEnd(BAR_W + W_PCT + 1)) +
    chalk.bold.dim("COST".padStart(W_COST));

  console.log("  " + sep);
  console.log("  " + hdr);
  console.log("  " + sep);

  for (const [model, v] of sorted) {
    const pct    = totalCost > 0 ? (v.cost / totalCost) * 100 : 0;
    const cfn    = modelColor(model);
    const bar    = renderBar(pct, BAR_W, cfn);
    const pctStr = `${pct.toFixed(1)}%`.padStart(W_PCT);
    const toks   = v.input + v.output + v.cacheRead + v.cacheWrite;

    console.log(
      "  " +
      cfn(model.padEnd(W_MODEL))                              +
      fmtTokens(toks).padEnd(W_TOTAL)                         + "  " +
      chalk.dim(fmtTokens(v.input).padEnd(W_INPUT))           +
      chalk.dim(fmtTokens(v.output).padEnd(W_OUTPUT))         + "  " +
      bar + " " + cfn(pctStr)                                  + "  " +
      chalk.green(fmtCost(v.cost).padStart(W_COST - 2))
    );
  }

  console.log("  " + sep);
  console.log(
    "  " +
    chalk.bold("TOTAL".padEnd(W_MODEL))                        +
    chalk.bold(fmtTokens(totalToks).padEnd(W_TOTAL))           + "  " +
    chalk.dim(fmtTokens(totalIn).padEnd(W_INPUT))              +
    chalk.dim(fmtTokens(totalOut).padEnd(W_OUTPUT))            + "  " +
    " ".repeat(BAR_W + 1) +
    chalk.bold("100%".padStart(W_PCT))                         + "  " +
    chalk.green.bold(fmtCost(totalCost).padStart(W_COST - 2))
  );
  console.log("  " + sep);
  console.log();
}
