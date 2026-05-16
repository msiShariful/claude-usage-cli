// Pricing per million tokens (April 2026 published Anthropic rates).
// Edit here if rates change — every command reads from this map.
export const PRICING = {
  opus:   { input: 15.0,  output: 75.0,  cacheWrite: 18.75, cacheRead: 1.5  },
  sonnet: { input: 3.0,   output: 15.0,  cacheWrite: 3.75,  cacheRead: 0.3  },
  haiku:  { input: 0.8,   output: 4.0,   cacheWrite: 1.0,   cacheRead: 0.08 },
};

export function getPrice(model = "") {
  const m = model.toLowerCase();
  if (m.includes("opus"))   return PRICING.opus;
  if (m.includes("sonnet")) return PRICING.sonnet;
  if (m.includes("haiku"))  return PRICING.haiku;
  return null;
}

export function calcCost(usage, model) {
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
