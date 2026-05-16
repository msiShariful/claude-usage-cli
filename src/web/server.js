import http from "http";
import fs   from "fs";
import path from "path";
import url  from "url";
import { exec } from "child_process";

import { loadAll } from "../parser.js";
import {
  todayData, dailyData, monthlyData, statsData, projectsData,
  modelsData, sessionData, blocksData, historyData, liveData,
} from "./data.js";

const PUBLIC_DIR = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

// Set of values from the query that are safe to pass straight through.
function pickOpts(q) {
  const opts = {};
  if (q.since)  opts.since  = q.since;
  if (q.until)  opts.until  = q.until;
  if (q.limit)  opts.limit  = Number(q.limit);
  if (q.sort)   opts.sort   = q.sort;
  if (q.period) opts.period = q.period;
  if (q.project) opts.project = q.project;
  return opts;
}

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

function serveStatic(res, filePath) {
  // Resolve and confirm we're still inside PUBLIC_DIR (defence in depth — query params
  // never reach this branch but a bad URL could).
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) return notFound(res);
  fs.readFile(resolved, (err, buf) => {
    if (err) return notFound(res);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(buf);
  });
}

function handle(req, res) {
  const parsed = url.parse(req.url, true);
  const route  = parsed.pathname;
  const q      = parsed.query;
  const opts   = pickOpts(q);

  // API routes — every one re-reads the JSONL logs so /live picks up new turns.
  if (route.startsWith("/api/")) {
    try {
      const records = loadAll();
      switch (route) {
        case "/api/today":    return json(res, todayData(records));
        case "/api/daily":    return json(res, dailyData(records, opts));
        case "/api/monthly":  return json(res, monthlyData(records, opts));
        case "/api/stats":    return json(res, statsData(records, opts));
        case "/api/projects": return json(res, projectsData(records, opts));
        case "/api/models":   return json(res, modelsData(records, opts.period ?? "all", opts));
        case "/api/session":  return json(res, sessionData(records, opts));
        case "/api/blocks":   return json(res, blocksData(records, opts));
        case "/api/history":  return json(res, historyData(opts));
        case "/api/live":     return json(res, liveData());
        default: return notFound(res);
      }
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // Static — root → index.html, everything else looked up under public/.
  if (route === "/" || route === "") return serveStatic(res, path.join(PUBLIC_DIR, "index.html"));
  return serveStatic(res, path.join(PUBLIC_DIR, route));
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? `open "${url}"`
            : process.platform === "win32"  ? `start "" "${url}"`
            :                                 `xdg-open "${url}"`;
  exec(cmd, () => {});
}

export function startServer({ port = 7777, open = true } = {}) {
  const server = http.createServer(handle);
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  ◈ claude-usage web  →  \x1b[36m${url}\x1b[0m`);
    console.log(`  \x1b[2mreading ${process.env.HOME}/.claude/projects/\x1b[0m`);
    console.log(`  \x1b[2mctrl-c to stop\x1b[0m\n`);
    if (open) openBrowser(url);
  });
  server.on("error", err => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n  port ${port} is in use — try a different one: claude-usage web --port 7778\n`);
      process.exit(1);
    }
    throw err;
  });
  return server;
}
