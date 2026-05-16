// claude-usage web — single-page dashboard.
// Each view is a function that fetches /api/<x> and renders into #view.
// Live + Blocks auto-refresh every few seconds; everything else loads once
// per route change.

const fmtUSD = n => "$" + (n ?? 0).toFixed(4);
const fmtUSDCompact = n => n >= 100 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
const fmtTokens = n => {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
};
const fmtTime = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const fmtDuration = ms => {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
};
const modelChipClass = m => {
  const n = (m || "").toLowerCase();
  if (n.includes("opus"))   return "chip chip-opus";
  if (n.includes("sonnet")) return "chip chip-sonnet";
  if (n.includes("haiku"))  return "chip chip-haiku";
  return "chip";
};
const modelBarClass = m => {
  const n = (m || "").toLowerCase();
  if (n.includes("opus"))   return "bar opus";
  if (n.includes("sonnet")) return "bar sonnet";
  if (n.includes("haiku"))  return "bar haiku";
  return "bar";
};

const $ = sel => document.querySelector(sel);

async function fetchJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

function setActiveNav(name) {
  document.querySelectorAll("#nav a").forEach(a => {
    a.classList.toggle("active", a.dataset.view === name);
  });
}

function setTitle(t)   { $("#view-title").textContent = t; }
function setActions(html) { $("#topbar-actions").innerHTML = html; }
function setView(html) { $("#view").innerHTML = html; }
function setLoading()  { setView(`<div class="empty"><div class="spinner"></div></div>`); }
function setEmpty(msg) { setView(`<div class="empty"><h3>${msg}</h3></div>`); }

let liveTimer = null;
function clearTimers() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }
let chartInstances = []; // destroy old charts on view changes
function destroyCharts() { chartInstances.forEach(c => c.destroy()); chartInstances = []; }

// ── Views ──────────────────────────────────────────────────────────────────

async function viewToday() {
  setTitle("Today"); setActions(""); setLoading();
  const d = await fetchJSON("/api/today");
  const models = Object.entries(d.models);
  const cards = `
    <div class="cards">
      <div class="card"><div class="label">Spend</div><div class="value green">${fmtUSDCompact(d.total_cost)}</div><div class="sub">${d.date}</div></div>
      <div class="card"><div class="label">Turns</div><div class="value">${d.turns}</div></div>
      <div class="card"><div class="label">Models</div><div class="value">${models.length}</div></div>
    </div>`;

  if (!models.length) { setView(cards + `<div class="empty"><h3>No usage today yet</h3></div>`); return; }

  const rows = models
    .sort(([, a], [, b]) => b.cost - a.cost)
    .map(([m, v]) => {
      const total = v.input + v.output + v.cacheRead + v.cacheWrite;
      const pct = d.total_cost ? (v.cost / d.total_cost) * 100 : 0;
      return `<tr>
        <td><span class="${modelChipClass(m)}">${m}</span></td>
        <td class="num">${fmtTokens(v.input)}</td>
        <td class="num">${fmtTokens(v.output)}</td>
        <td class="num">${fmtTokens(v.cacheRead)}</td>
        <td class="num">${fmtTokens(total)}</td>
        <td style="min-width:160px"><div class="${modelBarClass(m)}"><span style="width:${pct}%"></span></div></td>
        <td class="num"><span class="cost">${fmtUSD(v.cost)}</span></td>
      </tr>`;
    }).join("");

  setView(cards + `
    <div class="panel">
      <h2>By model</h2>
      <table>
        <thead><tr><th>Model</th><th class="num">Input</th><th class="num">Output</th><th class="num">Cache</th><th class="num">Total tokens</th><th>Share</th><th class="num">Cost</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`);
}

async function viewLive() {
  setTitle("Live"); setActions(`<label>Refresh</label><select id="iv"><option value="2">2s</option><option value="3" selected>3s</option><option value="5">5s</option><option value="10">10s</option></select>`);

  const render = async () => {
    try {
      const d = await fetchJSON("/api/live");
      const t = d.today;
      const b = d.active_block;
      const blockCard = b ? `
        <div class="card">
          <div class="label">Active 5h block</div>
          <div class="value yellow">${fmtUSDCompact(b.cost)}</div>
          <div class="sub">${b.turns} turns · ${fmtDuration(b.remaining_ms)} left</div>
        </div>
        <div class="card">
          <div class="label">Burn rate</div>
          <div class="value">${fmtUSDCompact(b.burn_rate_per_hour)}<span class="muted" style="font-size:13px"> /h</span></div>
          <div class="sub">projected end: ${fmtUSDCompact(b.projected_cost)}</div>
        </div>` : `<div class="card"><div class="label">5h block</div><div class="value muted">—</div><div class="sub">no active block</div></div>`;

      const progress = b ? `
        <div class="panel">
          <h2>5-hour window progress</h2>
          <div class="row">
            <div style="flex:1"><div class="bar lg"><span style="width:${b.progress_pct}%"></span></div></div>
            <div style="width:60px; text-align:right; font-variant-numeric:tabular-nums;">${b.progress_pct.toFixed(0)}%</div>
          </div>
          <div class="row" style="margin-top:8px; color:var(--text-dim); font-size:12px;">
            <span>started ${fmtTime(b.start)}</span>
            <span style="margin-left:auto">ends ${fmtTime(b.end)}</span>
          </div>
        </div>` : "";

      const models = Object.entries(t.models)
        .sort(([, a], [, b]) => b.cost - a.cost)
        .map(([m, v]) => {
          const pct = t.total_cost ? (v.cost / t.total_cost) * 100 : 0;
          return `<tr>
            <td><span class="${modelChipClass(m)}">${m}</span></td>
            <td class="num">${fmtTokens(v.input + v.output + v.cacheRead)}</td>
            <td style="min-width:160px"><div class="${modelBarClass(m)}"><span style="width:${pct}%"></span></div></td>
            <td class="num">${pct.toFixed(0)}%</td>
            <td class="num"><span class="cost">${fmtUSDCompact(v.cost)}</span></td>
          </tr>`;
        }).join("");

      setView(`
        <div class="cards">
          <div class="card"><div class="label">Today</div><div class="value green">${fmtUSDCompact(t.total_cost)}</div><div class="sub">${t.turns} turns</div></div>
          ${blockCard}
          <div class="card"><div class="label">Last refresh</div><div class="value" style="font-size:14px">${new Date(d.server_time).toLocaleTimeString()}</div></div>
        </div>
        ${progress}
        <div class="panel">
          <h2>Today's models</h2>
          ${models ? `<table><thead><tr><th>Model</th><th class="num">Tokens</th><th>Share</th><th class="num">%</th><th class="num">Cost</th></tr></thead><tbody>${models}</tbody></table>` : `<div class="empty"><h3>No usage today yet</h3></div>`}
        </div>`);
    } catch (e) {
      setEmpty("Failed to fetch live data — " + e.message);
    }
  };

  await render();
  const iv = $("#iv");
  let intervalMs = Number(iv.value) * 1000;
  liveTimer = setInterval(render, intervalMs);
  iv.addEventListener("change", () => {
    clearInterval(liveTimer); intervalMs = Number(iv.value) * 1000;
    liveTimer = setInterval(render, intervalMs);
  });
}

async function viewBlocks() {
  setTitle("5-hour billing blocks");
  setActions(`<label>Show</label><select id="lim"><option>10</option><option selected>20</option><option>50</option></select>`);
  setLoading();
  const limit = $("#lim").value;
  const d = await fetchJSON("/api/blocks?limit=" + limit);
  $("#lim").addEventListener("change", viewBlocks);

  const active = d.find(b => b.active);
  const activeCard = active ? `
    <div class="panel">
      <h2>● Active block</h2>
      <div class="cards" style="margin-bottom:0">
        <div class="card"><div class="label">Spent</div><div class="value green">${fmtUSDCompact(active.cost)}</div><div class="sub">${active.turns} turns</div></div>
        <div class="card"><div class="label">Burn rate</div><div class="value yellow">${fmtUSDCompact(active.burn_rate_per_hour)}<span class="muted" style="font-size:13px">/h</span></div></div>
        <div class="card"><div class="label">Projected end</div><div class="value yellow">${fmtUSDCompact(active.projected_cost)}</div></div>
        <div class="card"><div class="label">Remaining</div><div class="value">${fmtDuration(active.remaining_ms)}</div></div>
      </div>
      <div style="margin-top:16px"><div class="bar lg"><span style="width:${active.progress_pct}%"></span></div></div>
    </div>` : "";

  const rows = d.map(b => `
    <tr>
      <td>${fmtTime(b.start)}</td>
      <td>${fmtTime(b.end)}</td>
      <td>${b.active ? `<span class="chip chip-live">● live</span>` : `<span class="chip chip-closed">closed</span>`}</td>
      <td class="num">${b.turns}</td>
      <td class="num">${fmtTokens(b.input + b.output + b.cacheRead + b.cacheWrite)}</td>
      <td class="num"><span class="cost">${fmtUSD(b.cost)}</span></td>
    </tr>`).join("");

  setView(activeCard + `
    <div class="panel">
      <h2>Recent blocks</h2>
      <table>
        <thead><tr><th>Started</th><th>Ends</th><th>Status</th><th class="num">Turns</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`);
}

async function viewDaily() {
  setTitle("Daily");
  setActions(`
    <label>Since</label><input type="date" id="since" />
    <label>Until</label><input type="date" id="until" />
    <button id="apply">Apply</button>
  `);
  const apply = async () => {
    setLoading();
    const since = $("#since").value;
    const until = $("#until").value;
    const qs = [since && `since=${since}`, until && `until=${until}`].filter(Boolean).join("&");
    const d = await fetchJSON("/api/daily" + (qs ? "?" + qs : ""));
    renderDailyOrMonthly(d.days, "date", d.range);
  };
  $("#apply").addEventListener("click", apply);
  await apply();
}

async function viewMonthly() {
  setTitle("Monthly");
  setActions(`
    <label>Since</label><input type="date" id="since" />
    <label>Until</label><input type="date" id="until" />
    <button id="apply">Apply</button>
  `);
  const apply = async () => {
    setLoading();
    const since = $("#since").value;
    const until = $("#until").value;
    const qs = [since && `since=${since}`, until && `until=${until}`].filter(Boolean).join("&");
    const d = await fetchJSON("/api/monthly" + (qs ? "?" + qs : ""));
    renderDailyOrMonthly(d.months, "month", d.range);
  };
  $("#apply").addEventListener("click", apply);
  await apply();
}

function renderDailyOrMonthly(rows, keyName, range) {
  destroyCharts();
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const totals = ["input", "output", "cacheRead"].reduce((acc, k) => {
    acc[k] = rows.reduce((s, r) => s + (r[k] ?? 0), 0); return acc;
  }, {});

  const labelDates = rows.map(r => r[keyName]);
  const labelText  = keyName === "date" ? "day" : "month";

  const tr = rows.map(r => `
    <tr>
      <td>${r[keyName]}</td>
      <td class="num">${fmtTokens(r.input)}</td>
      <td class="num">${fmtTokens(r.output)}</td>
      <td class="num">${fmtTokens(r.cacheRead)}</td>
      <td class="num"><span class="cost">${fmtUSD(r.cost)}</span></td>
    </tr>`).join("");

  setView(`
    <div class="cards">
      <div class="card"><div class="label">Total cost</div><div class="value green">${fmtUSDCompact(total)}</div><div class="sub">${rows.length} ${labelText}s</div></div>
      <div class="card"><div class="label">Input</div><div class="value">${fmtTokens(totals.input)}</div></div>
      <div class="card"><div class="label">Output</div><div class="value">${fmtTokens(totals.output)}</div></div>
      <div class="card"><div class="label">Cache read</div><div class="value">${fmtTokens(totals.cacheRead)}</div></div>
    </div>
    <div class="panel">
      <h2>Cost over time</h2>
      <canvas id="chart" height="80"></canvas>
    </div>
    <div class="panel">
      <h2>${labelText[0].toUpperCase() + labelText.slice(1)} breakdown</h2>
      <table>
        <thead><tr><th>${keyName === "date" ? "Date" : "Month"}</th><th class="num">Input</th><th class="num">Output</th><th class="num">Cache read</th><th class="num">Cost</th></tr></thead>
        <tbody>${tr}</tbody>
      </table>
    </div>
  `);

  const ctx = document.getElementById("chart");
  if (ctx) {
    chartInstances.push(new Chart(ctx, {
      type: "bar",
      data: {
        labels: labelDates,
        datasets: [{
          label: "Cost ($)",
          data: rows.map(r => r.cost),
          backgroundColor: "rgba(77, 208, 225, 0.55)",
          borderColor: "rgba(77, 208, 225, 1)",
          borderWidth: 1, borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#8a93a6" }, grid: { color: "rgba(255,255,255,0.04)" } },
          y: { ticks: { color: "#8a93a6", callback: v => "$" + v }, grid: { color: "rgba(255,255,255,0.04)" } },
        },
      },
    }));
  }
}

async function viewModels() {
  setTitle("Models");
  setActions(`
    <label>Period</label>
    <select id="period">
      <option value="all" selected>All time</option>
      <option value="today">Today</option>
      <option value="yesterday">Yesterday</option>
      <option value="week">Last 7 days</option>
      <option value="month">Last 30 days</option>
    </select>
  `);
  const render = async () => {
    setLoading();
    const period = $("#period").value;
    const d = await fetchJSON("/api/models?period=" + period);
    destroyCharts();

    const rows = d.models.map(m => `
      <tr>
        <td><span class="${modelChipClass(m.model)}">${m.model}</span></td>
        <td class="num">${fmtTokens(m.input + m.output + m.cacheRead + m.cacheWrite)}</td>
        <td class="num">${fmtTokens(m.input)}</td>
        <td class="num">${fmtTokens(m.output)}</td>
        <td style="min-width:160px"><div class="${modelBarClass(m.model)}"><span style="width:${m.share * 100}%"></span></div></td>
        <td class="num">${(m.share * 100).toFixed(1)}%</td>
        <td class="num"><span class="cost">${fmtUSD(m.cost)}</span></td>
      </tr>`).join("");

    setView(`
      <div class="cards">
        <div class="card"><div class="label">Period</div><div class="value" style="font-size:14px">${d.period}</div></div>
        <div class="card"><div class="label">Total</div><div class="value green">${fmtUSDCompact(d.total_cost)}</div></div>
        <div class="card"><div class="label">Models</div><div class="value">${d.models.length}</div></div>
      </div>
      <div class="grid-1-2">
        <div class="panel"><h2>Cost share</h2><canvas id="donut" height="240"></canvas></div>
        <div class="panel">
          <h2>Breakdown</h2>
          <table>
            <thead><tr><th>Model</th><th class="num">Total tokens</th><th class="num">Input</th><th class="num">Output</th><th>Share</th><th class="num">%</th><th class="num">Cost</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `);

    const ctx = document.getElementById("donut");
    if (ctx && d.models.length) {
      const palette = m => {
        const n = m.toLowerCase();
        if (n.includes("opus"))   return "#d97aff";
        if (n.includes("sonnet")) return "#4dd0e1";
        if (n.includes("haiku"))  return "#f5c451";
        return "#8a93a6";
      };
      chartInstances.push(new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: d.models.map(m => m.model),
          datasets: [{
            data: d.models.map(m => m.cost),
            backgroundColor: d.models.map(m => palette(m.model)),
            borderColor: "#161a23", borderWidth: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "65%",
          plugins: { legend: { position: "bottom", labels: { color: "#e4e7ee" } } },
        },
      }));
    }
  };
  $("#period").addEventListener("change", render);
  await render();
}

async function viewProjects() {
  setTitle("Projects"); setActions(""); setLoading();
  const d = await fetchJSON("/api/projects");
  const total = d.reduce((s, p) => s + p.cost, 0);
  const rows = d.map(p => `
    <tr>
      <td>${p.display}</td>
      <td class="num">${p.sessions}</td>
      <td class="num">${fmtTokens(p.input)}</td>
      <td class="num">${fmtTokens(p.output)}</td>
      <td style="min-width:140px"><div class="bar"><span style="width:${total ? (p.cost/total)*100 : 0}%"></span></div></td>
      <td class="num"><span class="cost">${fmtUSD(p.cost)}</span></td>
    </tr>`).join("");
  setView(`
    <div class="cards">
      <div class="card"><div class="label">Projects</div><div class="value">${d.length}</div></div>
      <div class="card"><div class="label">Total spend</div><div class="value green">${fmtUSDCompact(total)}</div></div>
    </div>
    <div class="panel">
      <h2>Cost by project</h2>
      <table>
        <thead><tr><th>Project</th><th class="num">Sessions</th><th class="num">Input</th><th class="num">Output</th><th>Share</th><th class="num">Cost</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`);
}

async function viewSession() {
  setTitle("Sessions");
  setActions(`
    <label>Sort</label>
    <select id="sort"><option value="cost" selected>Cost</option><option value="recent">Recent</option></select>
    <label>Limit</label>
    <select id="lim"><option>20</option><option selected>50</option><option>100</option></select>
  `);
  const render = async () => {
    setLoading();
    const d = await fetchJSON(`/api/session?sort=${$("#sort").value}&limit=${$("#lim").value}`);
    const rows = d.map(s => `
      <tr>
        <td><code style="font-size:12px;color:var(--text-dim)">${s.session.slice(0, 8)}</code></td>
        <td>${s.project_display}</td>
        <td>${s.models.map(m => `<span class="${modelChipClass(m)}">${m}</span>`).join(" ")}</td>
        <td class="num">${s.turns}</td>
        <td class="history-time">${fmtTime(s.last_ts)}</td>
        <td class="num">${fmtTokens(s.input + s.output + s.cacheRead + s.cacheWrite)}</td>
        <td class="num"><span class="cost">${fmtUSD(s.cost)}</span></td>
      </tr>`).join("");
    setView(`
      <div class="panel">
        <h2>${d.length} sessions</h2>
        <table>
          <thead><tr><th>ID</th><th>Project</th><th>Models</th><th class="num">Turns</th><th>Last activity</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  };
  $("#sort").addEventListener("change", render);
  $("#lim").addEventListener("change", render);
  await render();
}

async function viewHistory() {
  setTitle("Prompt history");
  setActions(`
    <label>Limit</label>
    <select id="lim"><option>50</option><option selected>100</option><option>250</option></select>
  `);
  const render = async () => {
    setLoading();
    const d = await fetchJSON("/api/history?limit=" + $("#lim").value);
    const rows = d.map(p => `
      <tr>
        <td class="history-time">${fmtTime(p.timestamp)}</td>
        <td><span class="chip">${p.project}</span></td>
        <td class="history-prompt">${escapeHtml(p.prompt || "")}</td>
        <td><code style="font-size:12px;color:var(--text-dim)">${(p.session || "").slice(0, 8)}</code></td>
        <td class="num">${p.cost != null ? `<span class="cost">${fmtUSD(p.cost)}</span>` : `<span class="muted">—</span>`}</td>
      </tr>`).join("");
    setView(`
      <div class="panel">
        <h2>${d.length} prompts</h2>
        <table>
          <thead><tr><th>Time</th><th>Project</th><th>Prompt</th><th>Session</th><th class="num">Cost</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  };
  $("#lim").addEventListener("change", render);
  await render();
}

async function viewStats() {
  setTitle("All-time stats"); setActions(""); setLoading();
  const d = await fetchJSON("/api/stats");
  setView(`
    <div class="cards">
      <div class="card"><div class="label">Total cost</div><div class="value green">${fmtUSDCompact(d.cost)}</div><div class="sub">${d.range}</div></div>
      <div class="card"><div class="label">Sessions</div><div class="value">${d.session_count}</div></div>
      <div class="card"><div class="label">Projects</div><div class="value">${d.project_count}</div></div>
      <div class="card"><div class="label">Models</div><div class="value">${d.models.length}</div></div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h2>Tokens</h2>
        <table>
          <tr><td>Input</td><td class="num">${fmtTokens(d.input)}</td></tr>
          <tr><td>Output</td><td class="num">${fmtTokens(d.output)}</td></tr>
          <tr><td>Cache read</td><td class="num">${fmtTokens(d.cacheRead)}</td></tr>
          <tr><td>Cache write</td><td class="num">${fmtTokens(d.cacheWrite)}</td></tr>
        </table>
      </div>
      <div class="panel">
        <h2>Models used</h2>
        <div>${d.models.map(m => `<span class="${modelChipClass(m)}" style="margin:4px 4px 0 0; display:inline-block">${m}</span>`).join("")}</div>
      </div>
    </div>`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ── Router ─────────────────────────────────────────────────────────────────
const ROUTES = {
  today:    viewToday,
  live:     viewLive,
  blocks:   viewBlocks,
  daily:    viewDaily,
  monthly:  viewMonthly,
  models:   viewModels,
  projects: viewProjects,
  session:  viewSession,
  history:  viewHistory,
  stats:    viewStats,
};

async function route() {
  clearTimers();
  destroyCharts();
  const hash = (location.hash || "#today").slice(1);
  const view = ROUTES[hash] ?? viewToday;
  setActiveNav(hash);
  try { await view(); }
  catch (e) { setEmpty("Error loading view: " + e.message); }
}

window.addEventListener("hashchange", route);

// Server-time ticker in the sidebar — keeps it obvious that the dashboard is live.
function tickClock() {
  $("#server-time").textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000);
tickClock();

route();
