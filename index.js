#!/usr/bin/env node
import chalk from "chalk";
import fs from "fs";
import path from "path";
import os from "os";

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

// ── Entry Point ──────────────────────────────────────────────────────────
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const cmd = process.argv[2] ?? "today";
const records = loadAll(PROJECTS_DIR);

const HELP = `
${chalk.bold.cyan("claude-usage")} — Claude Code local usage viewer

${chalk.bold("Commands:")}
  today     Usage breakdown for today (default)
  week      Last 7 days summary
  stats     All-time totals
  projects  Cost grouped by project

${chalk.bold("Example:")}
  node index.js
  node index.js week
  node index.js projects
`;

switch (cmd) {
  case "today":    today(records);    break;
  case "week":     week(records);     break;
  case "stats":    stats(records);    break;
  case "projects": projects(records); break;
  default:         console.log(HELP);
}