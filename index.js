#!/usr/bin/env node
import chalk from "chalk";
import fs from "fs";
import path from "path";
import os from "os";

// ── Badge color palette ──────────────────────────────────────────────────
const BADGE_PALETTE = [
  chalk.bgCyan.black,
  chalk.bgYellow.black,
  chalk.bgMagenta.white,
  chalk.bgBlue.white,
  chalk.bgGreen.black,
  chalk.bgRed.white,
  chalk.bgWhite.black,
];
const _badgeMap = new Map();
let _badgeIdx = 0;
function badgeColor(label) {
  if (!_badgeMap.has(label)) {
    _badgeMap.set(label, BADGE_PALETTE[_badgeIdx % BADGE_PALETTE.length]);
    _badgeIdx++;
  }
  return _badgeMap.get(label);
}

// ── Pricing per million tokens (April 2026) ─────────────────────────────
const PRICING = {
  opus:   { input: 15.0,  output: 75.0,  cacheWrite: 18.75, cacheRead: 1.5  },
  sonnet: { input: 3.0,   output: 15.0,  cacheWrite: 3.75,  cacheRead: 0.3  },
  haiku:  { input: 0.8,   output: 4.0,   cacheWrite: 1.0,   cacheRead: 0.08 },
};

function getPrice(model = "") {
  const m = model.toLowerCase();
  if (m.includes("opus"))   return PRICING.opus;
  if (m.includes("sonnet")) return PRICING.sonnet;
  if (m.includes("haiku"))  return PRICING.haiku;
  return null;
}

function calcCost(usage, model) {
  const p = getPrice(model);
  if (!p) return 0;
  const M = 1_000_000;
  return (
    (usage.input_tokens ?? 0)                  * p.input      / M +
    (usage.output_tokens ?? 0)                 * p.output     / M +
    (usage.cache_creation_input_tokens ?? 0)   * p.cacheWrite / M +
    (usage.cache_read_input_tokens ?? 0)       * p.cacheRead  / M
  );
}

function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n) {
  return `$${n.toFixed(4)}`;
}

function fmtHistoryTime(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  const day   = d.getDate();
  const month = d.toLocaleString("en", { month: "short" });
  const hh    = String(d.getHours()).padStart(2, "0");
  const mm    = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month}, ${hh}:${mm}`;
}

const SYSTEM_PREFIXES = [
  "<local-command", "<bash-stdout", "<bash-input", "<bash-stderr",
  "<command-name", "<command-message", "<system-reminder", "<user-prompt",
  "<task-notification", "<task-update",
  "[Request interrupted", "[Image: source", "[Image source",
  "This session is being continued",
  "[2m",
];

function isSystemText(t) {
  return SYSTEM_PREFIXES.some(p => t.startsWith(p));
}

function extractPromptText(content, maxLen = 60) {
  let text;
  if (typeof content === "string") {
    const t = content.trimStart();
    if (isSystemText(t)) return null;
    text = content;
  } else if (Array.isArray(content)) {
    const block = content.find(b => b.type === "text");
    if (!block?.text) return null;
    const t = block.text.trimStart();
    if (isSystemText(t)) return null;
    text = block.text;
  } else {
    return null;
  }
  text = text.replace(/\n+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

// ── JSONL Parser ─────────────────────────────────────────────────────────
function parseSession(filePath) {
  const records = [];
  const seen = new Map(); // requestId -> record (keep latest)
  let raw;
  try { raw = fs.readFileSync(filePath, "utf8"); }
  catch { return records; }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }

    if (obj.type !== "assistant") continue;
    const msg = obj.message ?? {};
    const usage = msg.usage;
    if (!usage) continue;

    const record = {
      usage,
      model:   msg.model ?? "",
      ts:      obj.timestamp ?? "",
      reqId:   obj.requestId ?? msg.id ?? null,
    };

    if (record.reqId) {
      seen.set(record.reqId, record); // deduplicate
    } else {
      records.push(record);
    }
  }

  records.push(...seen.values());
  return records;
}

function loadAll(projectsDir) {
  const all = [];
  if (!fs.existsSync(projectsDir)) return all;

  for (const projectName of fs.readdirSync(projectsDir)) {
    const projectPath = path.join(projectsDir, projectName);
    if (!fs.statSync(projectPath).isDirectory()) continue;

    for (const file of fs.readdirSync(projectPath)) {
      if (!file.endsWith(".jsonl")) continue;
      const sessionId = file.replace(".jsonl", "");
      const records = parseSession(path.join(projectPath, file));
      for (const r of records) {
        r.project = projectName;
        r.session = sessionId;
      }
      all.push(...records);
    }
  }
  return all;
}

function parseSessionFull(filePath) {
  const entries = [];
  let raw;
  try { raw = fs.readFileSync(filePath, "utf8"); } catch { return entries; }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }

    if (obj.type === "user" && obj.message?.content) {
      entries.push({
        type:      "user",
        uuid:      obj.uuid ?? null,
        content:   obj.message.content,
        timestamp: obj.timestamp ?? "",
        cwd:       obj.cwd ?? "",
      });
    } else if (obj.type === "assistant") {
      const msg = obj.message ?? {};
      if (!msg.usage) continue;
      entries.push({
        type:       "assistant",
        parentUuid: obj.parentUuid ?? null,
        usage:      msg.usage,
        model:      msg.model ?? "",
      });
    }
  }
  return entries;
}

function loadAllMessages(projectsDir) {
  const all = [];
  if (!fs.existsSync(projectsDir)) return all;

  for (const projectName of fs.readdirSync(projectsDir)) {
    const projectPath = path.join(projectsDir, projectName);
    if (!fs.statSync(projectPath).isDirectory()) continue;

    for (const file of fs.readdirSync(projectPath)) {
      if (!file.endsWith(".jsonl")) continue;
      const sessionId = file.replace(".jsonl", "");
      const entries   = parseSessionFull(path.join(projectPath, file));
      for (const e of entries) {
        e.project = projectName;
        e.session = sessionId;
      }
      all.push(...entries);
    }
  }
  return all;
}

// ── Table Renderer ───────────────────────────────────────────────────────
function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i]).length))
  );
  const sep = "─".repeat(widths.reduce((a, w) => a + w + 3, 1));

  console.log(chalk.dim(sep));
  console.log("  " + headers.map((h, i) => chalk.bold(h.padEnd(widths[i]))).join(chalk.dim("  │  ")));
  console.log(chalk.dim(sep));
  for (const row of rows) {
    console.log("  " + row.map((c, i) => String(c).padEnd(widths[i])).join(chalk.dim("  │  ")));
  }
  console.log(chalk.dim(sep));
}

// ── Model usage helpers ──────────────────────────────────────────────────
function modelColor(name) {
  const n = name.toLowerCase();
  if (n.includes("opus"))   return chalk.magenta;
  if (n.includes("sonnet")) return chalk.cyan;
  if (n.includes("haiku"))  return chalk.yellow;
  return chalk.white;
}

function filterByPeriod(records, period) {
  const now          = new Date();
  const todayStr     = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const weekAgo      = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo     = new Date(now - 29 * 86_400_000).toISOString().slice(0, 10);
  switch (period) {
    case "today":     return records.filter(r => r.ts.startsWith(todayStr));
    case "yesterday": return records.filter(r => r.ts.startsWith(yesterdayStr));
    case "week":      return records.filter(r => r.ts.slice(0, 10) >= weekAgo);
    case "month":     return records.filter(r => r.ts.slice(0, 10) >= monthAgo);
    default:          return records;
  }
}

function periodLabel(period) {
  switch (period) {
    case "today":     return "TODAY";
    case "yesterday": return "YESTERDAY";
    case "week":      return "LAST 7 DAYS";
    case "month":     return "LAST 30 DAYS";
    default:          return "ALL TIME";
  }
}

function renderBar(pct, width, colorFn) {
  const filled = Math.round(pct / 100 * width);
  return colorFn("█".repeat(filled)) + chalk.dim("░".repeat(width - filled));
}

// ── Commands ─────────────────────────────────────────────────────────────
function today(records) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const recs = records.filter(r => r.ts.startsWith(todayStr));

  console.log(`\n${chalk.bold.cyan("Today's Usage")}  ${chalk.dim(todayStr)}\n`);

  if (!recs.length) {
    console.log(chalk.yellow("  No usage found for today.\n"));
    return;
  }

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

  const rows = Object.entries(byModel).map(([model, v]) => [
    model.replace(/-\d{8}$/, ""),  // trim date suffix like -20250514
    fmtTokens(v.input),
    fmtTokens(v.output),
    fmtTokens(v.cacheRead),
    chalk.green(fmtCost(v.cost)),
  ]);

  printTable(["Model", "Input", "Output", "Cache Read", "Est. Cost"], rows);
  const total = Object.values(byModel).reduce((s, v) => s + v.cost, 0);
  console.log(`\n  ${chalk.bold("Total:")} ${chalk.green.bold(fmtCost(total))}\n`);
}

function week(records) {
  const byDay = {};
  for (const r of records) {
    const day = r.ts.slice(0, 10);
    if (!day) continue;
    byDay[day] ??= { input: 0, output: 0, cost: 0 };
    byDay[day].input  += r.usage.input_tokens ?? 0;
    byDay[day].output += r.usage.output_tokens ?? 0;
    byDay[day].cost   += calcCost(r.usage, r.model);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  console.log(`\n${chalk.bold.cyan("Last 7 Days")}\n`);
  const rows = days.map(day => {
    const v = byDay[day] ?? { input: 0, output: 0, cost: 0 };
    return [day, fmtTokens(v.input), fmtTokens(v.output), chalk.green(fmtCost(v.cost))];
  });
  printTable(["Date", "Input", "Output", "Est. Cost"], rows);
  console.log();
}

function stats(records) {
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

  console.log(`\n${chalk.bold.cyan("All-Time Stats")}\n`);
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

function projects(records) {
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
  console.log(`\n${chalk.bold.cyan("Usage by Project")}\n`);
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

function modelUsage(records, period = "all") {
  const filtered = filterByPeriod(records, period);
  const label    = periodLabel(period);

  if (!filtered.length) {
    console.log(`\n${chalk.bold.cyan("◈ MODEL USAGE")}  ${chalk.dim("·")}  ${chalk.bold(label)}\n`);
    console.log(chalk.yellow("  No usage found for this period.\n"));
    return;
  }

  // Aggregate by model
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

  // ── Header box ────────────────────────────────────────────────────────
  const BOX_W = 62;
  const titleCore = `◈ MODEL USAGE  ·  ${label}`;
  const countTag  = `${modelCount} model${modelCount !== 1 ? "s" : ""}`;
  const gap       = BOX_W - 2 - titleCore.length - countTag.length;
  const inner     = titleCore + " ".repeat(Math.max(1, gap)) + countTag;

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

  // ── Column widths ─────────────────────────────────────────────────────
  const W_MODEL   = Math.max(20, ...sorted.map(([m]) => m.length)) + 2;
  const W_TOTAL   = 13;
  const W_INPUT   = 10;
  const W_OUTPUT  = 10;
  const BAR_W     = 16;
  const W_PCT     = 6;   // "82.4%"
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

  // ── Rows ──────────────────────────────────────────────────────────────
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

  // ── Totals row ────────────────────────────────────────────────────────
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

function history(filterArg = null) {
  const allMessages = loadAllMessages(PROJECTS_DIR);

  // Build cost lookup: userUuid → cost (from the assistant reply)
  const costByParent = new Map();
  for (const m of allMessages) {
    if (m.type === "assistant" && m.parentUuid) {
      const c = calcCost(m.usage, m.model);
      costByParent.set(m.parentUuid, (costByParent.get(m.parentUuid) ?? 0) + c);
    }
  }

  // Collect project labels for the filter bar (pre-populate badge colors in sorted order)
  const allLabels = [...new Set(
    allMessages
      .filter(m => m.type === "user")
      .map(m => m.cwd ? path.basename(m.cwd) : "")
      .filter(Boolean)
  )].sort();
  allLabels.forEach(l => badgeColor(l)); // seed consistent color assignments

  // Filter user prompts — skip system-injected messages and non-text content
  let prompts = allMessages.filter(m =>
    m.type === "user" && m.content && extractPromptText(m.content, 1) !== null
  );
  if (filterArg) {
    prompts = prompts.filter(m => (m.cwd ? path.basename(m.cwd) : "") === filterArg);
  }
  prompts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  prompts = prompts.slice(0, 50);

  // ── Header ────────────────────────────────────────────────────────────
  const filterStr = filterArg ? ` ${chalk.dim("›")} ${chalk.cyan(filterArg)}` : "";
  const countStr  = chalk.dim(`${prompts.length} entr${prompts.length === 1 ? "y" : "ies"}`);
  console.log(`\n  ${chalk.bold.white("PROMPT HISTORY")}${filterStr}  ${countStr}`);

  // ── Filter bar ────────────────────────────────────────────────────────
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

  // ── Column layout ─────────────────────────────────────────────────────
  const W_TIME    = 16;
  const W_PROJECT = 16; // visible chars (badge text + spaces around it)
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

// ── Entry Point ──────────────────────────────────────────────────────────
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const cmd  = process.argv[2] ?? "today";
const arg3 = process.argv[3] ?? null;
const records = loadAll(PROJECTS_DIR);

const HELP = `
${chalk.bold.cyan("claude-usage")} — Claude Code local usage viewer

${chalk.bold("Commands:")}
  today              Usage breakdown for today (default)
  week               Last 7 days summary
  stats              All-time totals
  projects           Cost grouped by project
  history [project]  Prompt history (newest first, last 50)
  models [period]    Model usage with % share bars (periods: today, yesterday, week, month)

${chalk.bold("Examples:")}
  claude-usage
  claude-usage week
  claude-usage models
  claude-usage models week
  claude-usage history
  claude-usage history uigen
`;

switch (cmd) {
  case "today":    today(records);       break;
  case "week":     week(records);        break;
  case "stats":    stats(records);       break;
  case "projects": projects(records);    break;
  case "history":  history(arg3);                  break;
  case "models":   modelUsage(records, arg3 ?? "all"); break;
  default:         console.log(HELP);
}