import chalk from "chalk";

export function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => stripAnsi(String(r[i])).length))
  );
  const sep = "─".repeat(widths.reduce((a, w) => a + w + 3, 1));

  console.log(chalk.dim(sep));
  console.log("  " + headers.map((h, i) => chalk.bold(h.padEnd(widths[i]))).join(chalk.dim("  │  ")));
  console.log(chalk.dim(sep));
  for (const row of rows) {
    console.log("  " + row.map((c, i) => padAnsi(String(c), widths[i])).join(chalk.dim("  │  ")));
  }
  console.log(chalk.dim(sep));
}

export function renderBar(pct, width, colorFn) {
  const filled = Math.round(pct / 100 * width);
  return colorFn("█".repeat(filled)) + chalk.dim("░".repeat(width - filled));
}

// strip ANSI escape codes so width math works on colored strings
export function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function padAnsi(s, width) {
  const visible = stripAnsi(s).length;
  return s + " ".repeat(Math.max(0, width - visible));
}
