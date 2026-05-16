import chalk from "chalk";

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

export function badgeColor(label) {
  if (!_badgeMap.has(label)) {
    _badgeMap.set(label, BADGE_PALETTE[_badgeIdx % BADGE_PALETTE.length]);
    _badgeIdx++;
  }
  return _badgeMap.get(label);
}

export function modelColor(name) {
  const n = name.toLowerCase();
  if (n.includes("opus"))   return chalk.magenta;
  if (n.includes("sonnet")) return chalk.cyan;
  if (n.includes("haiku"))  return chalk.yellow;
  return chalk.white;
}

export function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function fmtCost(n) {
  return `$${n.toFixed(4)}`;
}

export function fmtHistoryTime(isoStr) {
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

export function extractPromptText(content, maxLen = 60) {
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
