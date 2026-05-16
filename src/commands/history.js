import chalk from "chalk";
import path from "path";
import { calcCost } from "../pricing.js";
import { fmtCost, fmtHistoryTime, badgeColor, extractPromptText } from "../format.js";
import { loadAllMessages, PROJECTS_DIR } from "../parser.js";

export function history(filterArg = null, opts = {}) {
  const { json = false, limit = 50, since, until } = opts;
  const allMessages = loadAllMessages(PROJECTS_DIR);

  const costByParent = new Map();
  for (const m of allMessages) {
    if (m.type === "assistant" && m.parentUuid) {
      const c = calcCost(m.usage, m.model);
      costByParent.set(m.parentUuid, (costByParent.get(m.parentUuid) ?? 0) + c);
    }
  }

  const allLabels = [...new Set(
    allMessages
      .filter(m => m.type === "user")
      .map(m => m.cwd ? path.basename(m.cwd) : "")
      .filter(Boolean)
  )].sort();
  allLabels.forEach(l => badgeColor(l));

  let prompts = allMessages.filter(m =>
    m.type === "user" && m.content && extractPromptText(m.content, 1) !== null
  );
  if (filterArg) {
    prompts = prompts.filter(m => (m.cwd ? path.basename(m.cwd) : "") === filterArg);
  }
  if (since) prompts = prompts.filter(m => m.timestamp.slice(0, 10) >= since);
  if (until) prompts = prompts.filter(m => m.timestamp.slice(0, 10) <= until);
  prompts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  prompts = prompts.slice(0, limit);

  if (json) {
    console.log(JSON.stringify(
      prompts.map(p => ({
        timestamp: p.timestamp,
        project: p.cwd ? path.basename(p.cwd) : "unknown",
        session: p.session,
        prompt: extractPromptText(p.content, 500),
        cost: costByParent.get(p.uuid) ?? null,
      })),
      null, 2
    ));
    return;
  }

  const filterStr = filterArg ? ` ${chalk.dim("›")} ${chalk.cyan(filterArg)}` : "";
  const countStr  = chalk.dim(`${prompts.length} entr${prompts.length === 1 ? "y" : "ies"}`);
  console.log(`\n  ${chalk.bold.white("PROMPT HISTORY")}${filterStr}  ${countStr}`);

  const allTab = !filterArg ? chalk.bgWhite.black(" All ") : chalk.dim("All");
  const labelTabs = allLabels.map(label => {
    const fn = badgeColor(label);
    return label === filterArg ? fn(` ${label} `) : chalk.dim(label);
  });
  console.log(`\n  ${[allTab, ...labelTabs].join("  ")}\n`);

  if (!prompts.length) {
    console.log(chalk.yellow("  No prompts found.\n"));
    return;
  }

  const W_TIME    = 16;
  const W_PROJECT = 16;
  const W_PROMPT  = 60;
  const W_SESSION = 10;

  const sepWidth = 2 + W_TIME + 2 + W_PROJECT + 2 + W_PROMPT + 2 + W_SESSION + 2 + 8;
  const sep = chalk.dim("─".repeat(sepWidth));

  const header =
    chalk.bold.dim("TIME".padEnd(W_TIME))     + "  " +
    chalk.bold.dim("PROJECT".padEnd(W_PROJECT)) + "  " +
    chalk.bold.dim("PROMPT".padEnd(W_PROMPT))  + "  " +
    chalk.bold.dim("SESSION".padEnd(W_SESSION)) + "  " +
    chalk.bold.dim("COST");

  console.log("  " + sep);
  console.log("  " + header);
  console.log("  " + sep);

  for (const p of prompts) {
    const rawLabel  = p.cwd ? path.basename(p.cwd) : "unknown";
    const label     = rawLabel.length > W_PROJECT - 2 ? rawLabel.slice(0, W_PROJECT - 3) + "…" : rawLabel;
    const badgeFn   = badgeColor(rawLabel);
    const badge     = badgeFn(` ${label} `);
    const badgePad  = " ".repeat(Math.max(0, W_PROJECT - label.length - 2));
    const time      = fmtHistoryTime(p.timestamp).padEnd(W_TIME);
    const promptTxt = (extractPromptText(p.content, W_PROMPT) ?? "").padEnd(W_PROMPT);
    const session   = chalk.dim(p.session.slice(0, 8).padEnd(W_SESSION));
    const rawCost   = costByParent.get(p.uuid);
    const cost      = rawCost != null ? chalk.green(fmtCost(rawCost)) : chalk.dim("—");

    console.log(
      "  " +
      chalk.white(time) + "  " +
      badge + badgePad  + "  " +
      promptTxt         + "  " +
      session           + "  " +
      cost
    );
  }

  console.log("  " + sep + "\n");
}
