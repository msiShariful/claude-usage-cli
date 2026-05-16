import fs from "fs";
import path from "path";
import os from "os";

export const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

// Parse a single .jsonl session, keeping only assistant turns with usage.
// Dedupes by requestId so retried requests aren't double-billed.
export function parseSession(filePath) {
  const records = [];
  const seen = new Map();
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

    if (record.reqId) seen.set(record.reqId, record);
    else              records.push(record);
  }

  records.push(...seen.values());
  return records;
}

export function loadAll(projectsDir = PROJECTS_DIR) {
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

// Full parser used by history — includes user prompts as well as assistant usage.
export function parseSessionFull(filePath) {
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

export function loadAllMessages(projectsDir = PROJECTS_DIR) {
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
