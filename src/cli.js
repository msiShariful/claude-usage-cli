import { loadAll } from "./parser.js";
import { HELP, VERSION } from "./help.js";

import { today }      from "./commands/today.js";
import { daily }      from "./commands/daily.js";
import { weekly }     from "./commands/weekly.js";
import { monthly }    from "./commands/monthly.js";
import { stats }      from "./commands/stats.js";
import { projects }   from "./commands/projects.js";
import { modelUsage } from "./commands/models.js";
import { history }    from "./commands/history.js";

// Argv shape:
//   claude-usage [command] [positional] [--flag] [--flag value]
// Flags are pulled out first so commands receive a clean { json, since, until, ... } options object.
function parseArgs(argv) {
  const out = { _: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json")        out.opts.json = true;
    else if (a === "--breakdown") out.opts.breakdown = true;
    else if (a === "--since")  out.opts.since = argv[++i];
    else if (a === "--until")  out.opts.until = argv[++i];
    else if (a === "--limit")  out.opts.limit = Number(argv[++i]);
    else if (a === "-h" || a === "--help") out.opts.help = true;
    else if (a === "-v" || a === "--version") out.opts.version = true;
    else if (a.startsWith("--")) { /* unknown — ignore for now */ }
    else out._.push(a);
  }
  return out;
}

export function run(argv) {
  const { _, opts } = parseArgs(argv);

  if (opts.help)    { console.log(HELP); return; }
  if (opts.version) { console.log(VERSION); return; }

  const cmd  = _[0] ?? "today";
  const arg3 = _[1] ?? null;
  const records = loadAll();

  switch (cmd) {
    case "today":              today(records, opts); break;
    case "daily":              daily(records, opts); break;
    case "week":
    case "weekly":             weekly(records, opts); break;
    case "month":
    case "monthly":            monthly(records, opts); break;
    case "stats":              stats(records, opts); break;
    case "projects":           projects(records, opts); break;
    case "history":            history(arg3, opts); break;
    case "models":             modelUsage(records, arg3 ?? "all", opts); break;
    case "help":               console.log(HELP); break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}
