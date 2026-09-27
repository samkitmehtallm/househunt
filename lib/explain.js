// The LLM writes the one-line human summary of each option's tradeoff — the sentence
// Riya would otherwise have to write herself in the WhatsApp thread.
//
// It is deliberately NOT in the decision path. The matcher decides what qualifies; this
// only phrases the result. On a quota error or an outage the deterministic fallback
// below is used, and the app behaves identically otherwise.

const GEMINI_MODELS = (
  process.env.GEMINI_MODELS || "gemini-flash-latest,gemini-3.6-flash,gemini-3.1-flash-lite,gemini-flash-lite-latest"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no key");

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(20000),
        }
      );
      if (!res.ok) {
        if (RETRYABLE.has(res.status) || res.status === 404) continue; // try the next model
        throw new Error(`${res.status}`);
      }
      const data = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  throw new Error("all models unavailable");
}

function fallbackSummary(option) {
  const compromising = option.breakdown.filter((b) => b.gives_up.length > 0);
  if (compromising.length === 0) return "Everyone's dealbreakers and preferences are met on this one.";
  const parts = compromising.map((b) => `${b.name} gives up ${b.gives_up.join(" and ").toLowerCase()}`);
  return `Clears everyone's dealbreakers. ${parts.join("; ")}.`;
}

export async function summariseOptions(options) {
  if (!options.length) return [];

  const payload = options
    .map((o, i) => {
      const lines = o.breakdown
        .map((b) => `  ${b.name}: gets [${b.gets.join("; ")}] gives up [${b.gives_up.join("; ") || "nothing"}]`)
        .join("\n");
      return `Option ${i + 1}: ${o.listing.title}, ${o.listing.area}, ₹${o.listing.rent_total}/mo total\n${lines}`;
    })
    .join("\n\n");

  const prompt = `Three friends are choosing a shared flat. Each option below already clears everyone's dealbreakers — the only question left is which tradeoff they prefer.

For each option write ONE sentence (max 25 words) naming the real tradeoff, so they can compare options at a glance. Be concrete and neutral. Do not recommend one. Do not invent details.

${payload}

Return ONLY a JSON array of strings, one per option, no markdown fences.`;

  try {
    const raw = await callGemini(prompt);
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (Array.isArray(parsed) && parsed.length === options.length) {
      return parsed.map((s) => String(s));
    }
    throw new Error("shape mismatch");
  } catch {
    return options.map(fallbackSummary);
  }
}
