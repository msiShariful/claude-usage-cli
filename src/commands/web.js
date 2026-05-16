import { startServer } from "../web/server.js";

export function web(_records, opts = {}) {
  const port = Number(opts.port) || 7777;
  const open = opts.open !== false;
  startServer({ port, open });
}
