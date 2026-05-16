// Pure aggregation functions used by the web API.
// Each returns plain data — no chalk, no console.log — so it can be JSON-encoded
// straight to the browser. The CLI commands keep their own renderers; this module
// is the single source of truth for *what* gets aggregated, mirroring the CLI's behavior.

import path from "path";
import { calcCost } from "../pricing.js";
import { filterByPeriod, periodLabel } from "../filters.js";
import { loadAll, loadAllMessages, PROJECTS_DIR } from "../parser.js";
import { extractPromptText } from "../format.js";

const BLOCK_MS = 5 * 60 * 60 * 1000;

function emptyAgg() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}
function addUsage(agg, r) {
  agg.input      += r.usage.input_tokens ?? 0;
  agg.output     += r.usage.output_tokens ?? 0;
  agg.cacheRead  += r.usage.cache_read_input_tokens ?? 0;
  agg.cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
  agg.cost       += calcCost(r.usage, r.model);
}
const modelKey = m => (m || "unknown").replace(/-\d{8}$/, "");

export function todayData(records) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const recs = records.filter(r => r.ts.startsWith(todayStr));
  const byModel = {};
  for (const r of recs) {
    const m = modelKey(r.model);
    byModel[m] ??= emptyAgg();
    addUsage(byModel[m], r);
  }
  const total = Object.values(byModel).reduce((s, v) => s + v.cost, 0);
  return { date: todayStr, total_cost: total, turns: recs.length, models: byModel };
}

function enumerateDays(lo, hi) {
  const out = [];
  const start = new Date(lo + "T00:00:00Z");
  const end   = new Date(hi + "T00:00:00Z");
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function dailyData(records, { since, until } = {}) {
  let lo, hi;
  if (since || until) {
    records = filterByPeriod(records, "all", { since, until });
    const min = records.reduce((m, r) => {
      const d = r.ts.slice(0, 10);
      return !m || d < m ? d : m;
    }, null);
    lo = since ?? min ?? new Date().toISOString().slice(0, 10);
    hi = until ?? new Date().toISOString().slice(0, 10);
  } else {
    const today = new Date();
    hi = today.toISOString().slice(0, 10);
    lo = new Date(today - 6 * 86_400_000).toISOString().slice(0, 10);
    records = records.filter(r => r.ts.slice(0, 10) >= lo);
  }
  const days = enumerateDays(lo, hi);
  const byDay = {};
  for (const r of records) {
    const day = r.ts.slice(0, 10);
    if (!day || day < lo || day > hi) continue;
    byDay[day] ??= { ...emptyAgg(), byModel: {} };
    addUsage(byDay[day], r);
    const m = modelKey(r.model);
    byDay[day].byModel[m] ??= emptyAgg();
    addUsage(byDay[day].byModel[m], r);
  }
  return {
    range: { since: lo, until: hi },
    days: days.map(d => ({ date: d, ...(byDay[d] ?? { ...emptyAgg(), byModel: {} }) })),
  };
}

export function monthlyData(records, { since, until } = {}) {
  records = filterByPeriod(records, "all", { since, until });
  const byMonth = {};
  for (const r of records) {
    const month = r.ts.slice(0, 7);
    if (!month) continue;
    byMonth[month] ??= { ...emptyAgg(), byModel: {} };
    addUsage(byMonth[month], r);
    const m = modelKey(r.model);
    byMonth[month].byModel[m] ??= emptyAgg();
    addUsage(byMonth[month].byModel[m], r);
  }
  const months = Object.keys(byMonth).sort();
  return {
    range: { since, until },
    months: months.map(m => ({ month: m, ...byMonth[m] })),
  };
}

export function statsData(records, { since, until } = {}) {
  records = filterByPeriod(records, "all", { since, until });
  const agg = emptyAgg();
  const models = new Set(), projects = new Set(), sessions = new Set();
  for (const r of records) {
    addUsage(agg, r);
    if (r.model)   models.add(modelKey(r.model));
    if (r.project) projects.add(r.project);
    if (r.session) sessions.add(r.session);
  }
  return {
    range: periodLabel("all", { since, until }),
    ...agg,
    models: [...models].sort(),
    project_count: projects.size,
    session_count: sessions.size,
  };
}

export function projectsData(records, { since, until } = {}) {
  records = filterByPeriod(records, "all", { since, until });
  const byProject = {};
  for (const r of records) {
    byProject[r.project] ??= { ...emptyAgg(), sessions: new Set() };
    addUsage(byProject[r.project], r);
    byProject[r.project].sessions.add(r.session);
  }
  return Object.entries(byProject)
    .map(([name, v]) => ({
      project: name,
      display: name.split("-").filter(Boolean).slice(-2).join("/"),
      sessions: v.sessions.size,
      input: v.input, output: v.output, cacheRead: v.cacheRead, cacheWrite: v.cacheWrite,
      cost: v.cost,
    }))
    .sort((a, b) => b.cost - a.cost);
}

export function modelsData(records, period = "all", { since, until } = {}) {
  const filtered = filterByPeriod(records, period, { since, until });
  const byModel = {};
  for (const r of filtered) {
    const m = modelKey(r.model);
    byModel[m] ??= emptyAgg();
    addUsage(byModel[m], r);
  }
  const sorted = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
  const totalCost = sorted.reduce((s, [, v]) => s + v.cost, 0);
  return {
    period: periodLabel(period, { since, until }),
    total_cost: totalCost,
    models: sorted.map(([m, v]) => ({
      model: m,
      ...v,
      share: totalCost ? v.cost / totalCost : 0,
    })),
  };
}

export function sessionData(records, { since, until, limit = 50, sort = "cost" } = {}) {
  const filtered = filterByPeriod(records, "all", { since, until });
  const bySession = {};
  for (const r of filtered) {
    bySession[r.session] ??= {
      ...emptyAgg(),
      project: r.project,
      firstTs: r.ts, lastTs: r.ts, turns: 0, models: new Set(),
    };
    const s = bySession[r.session];
    addUsage(s, r);
    s.turns += 1;
    if (r.model) s.models.add(modelKey(r.model));
    if (r.ts < s.firstTs) s.firstTs = r.ts;
    if (r.ts > s.lastTs)  s.lastTs  = r.ts;
  }
  const sorted = Object.entries(bySession).sort((a, b) =>
    sort === "recent" ? b[1].lastTs.localeCompare(a[1].lastTs) : b[1].cost - a[1].cost
  );
  return sorted.slice(0, limit).map(([id, v]) => ({
    session: id,
    project: v.project,
    project_display: (v.project ?? "").split("-").filter(Boolean).slice(-1)[0] ?? "—",
    turns: v.turns,
    first_ts: v.firstTs,
    last_ts: v.lastTs,
    models: [...v.models],
    input: v.input, output: v.output, cacheRead: v.cacheRead, cacheWrite: v.cacheWrite,
    cost: v.cost,
  }));
}

export function blocksData(records, { limit = 20 } = {}) {
  const sorted = records
    .filter(r => r.ts)
    .map(r => ({ ...r, t: Date.parse(r.ts) }))
    .filter(r => !Number.isNaN(r.t))
    .sort((a, b) => a.t - b.t);

  const blocks = [];
  let cur = null;
  for (const r of sorted) {
    if (!cur || r.t >= cur.startMs + BLOCK_MS) {
      cur = {
        startMs: r.t, endMs: r.t + BLOCK_MS,
        ...emptyAgg(), turns: 0, models: new Set(),
      };
      blocks.push(cur);
    }
    addUsage(cur, r);
    cur.turns += 1;
    if (r.model) cur.models.add(modelKey(r.model));
  }
  const now = Date.now();
  return blocks
    .slice(-limit)
    .reverse()
    .map(b => {
      const active   = now < b.endMs;
      const elapsed  = Math.min(now, b.endMs) - b.startMs;
      const remaining= active ? b.endMs - now : 0;
      const burn     = elapsed > 0 ? b.cost / (elapsed / 3_600_000) : 0;
      const proj     = active ? b.cost + burn * (remaining / 3_600_000) : b.cost;
      return {
        start: new Date(b.startMs).toISOString(),
        end:   new Date(b.endMs).toISOString(),
        active, turns: b.turns, models: [...b.models],
        input: b.input, output: b.output, cacheRead: b.cacheRead, cacheWrite: b.cacheWrite,
        cost: b.cost,
        burn_rate_per_hour: burn,
        projected_cost: proj,
        remaining_ms: remaining,
        elapsed_ms: elapsed,
        progress_pct: Math.min(100, (elapsed / BLOCK_MS) * 100),
      };
    });
}

export function historyData({ project, since, until, limit = 100 } = {}) {
  const allMessages = loadAllMessages(PROJECTS_DIR);

  const costByParent = new Map();
  for (const m of allMessages) {
    if (m.type === "assistant" && m.parentUuid) {
      const c = calcCost(m.usage, m.model);
      costByParent.set(m.parentUuid, (costByParent.get(m.parentUuid) ?? 0) + c);
    }
  }

  let prompts = allMessages.filter(m =>
    m.type === "user" && m.content && extractPromptText(m.content, 1) !== null
  );
  if (project) prompts = prompts.filter(m => (m.cwd ? path.basename(m.cwd) : "") === project);
  if (since)   prompts = prompts.filter(m => m.timestamp.slice(0, 10) >= since);
  if (until)   prompts = prompts.filter(m => m.timestamp.slice(0, 10) <= until);
  prompts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  prompts = prompts.slice(0, limit);

  return prompts.map(p => ({
    timestamp: p.timestamp,
    project: p.cwd ? path.basename(p.cwd) : "unknown",
    session: p.session,
    prompt: extractPromptText(p.content, 200),
    cost: costByParent.get(p.uuid) ?? null,
  }));
}

export function liveData() {
  const records = loadAll();
  return {
    today: todayData(records),
    active_block: blocksData(records, { limit: 1 }).filter(b => b.active)[0] ?? null,
    server_time: new Date().toISOString(),
  };
}
