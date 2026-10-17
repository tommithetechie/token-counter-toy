/**
 * Input prices in USD per 1,000,000 tokens.
 *
 * Figures are standard (not batch, flex, or cached) base input rates.
 * Checked 2026-10-17. The panel labels the result a rough estimate because
 * this toy's token count is not a provider tokenizer, and the rates below
 * leave out output tokens, cache reads and writes, and higher long-context
 * tiers.
 *
 * OpenAI — Standard short-context input (prompts up to 272K tokens):
 * https://developers.openai.com/api/docs/pricing
 *
 * Anthropic — base input tokens. Haiku 5.5 below is the rate for prompts
 * up to 100,000 tokens; the same page lists a higher rate above that:
 * https://platform.claude.com/docs/en/about-claude/pricing
 *
 * Google — Gemini Developer API, paid Standard tier, text input:
 * https://ai.google.dev/gemini-api/docs/pricing
 */
export const MODEL_PRICING = Object.freeze({
  checked: "2026-10-17",
  currency: "USD",
  unit: "per 1,000,000 input tokens",
  defaultModelId: "gpt-4o-mini",
  models: Object.freeze([
    Object.freeze({
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      inputPerMillion: 0.15,
    }),
    Object.freeze({
      id: "gpt-6-luna",
      label: "GPT-6 Luna",
      inputPerMillion: 0.1,
    }),
    Object.freeze({
      id: "gpt-6.1-sol",
      label: "GPT-6.1 Sol",
      inputPerMillion: 2,
    }),
    Object.freeze({
      id: "gpt-6-astra",
      label: "GPT-6 Astra",
      inputPerMillion: 10,
    }),
    Object.freeze({
      id: "claude-haiku-5-5",
      label: "Claude Haiku 5.5",
      inputPerMillion: 0.1,
      scope: "prompts ≤100k",
    }),
    Object.freeze({
      id: "claude-sonnet-5-5",
      label: "Claude Sonnet 5.5",
      inputPerMillion: 2,
    }),
    Object.freeze({
      id: "claude-opus-5-5",
      label: "Claude Opus 5.5",
      inputPerMillion: 4,
    }),
    Object.freeze({
      id: "gemini-3.5-flash-lite",
      label: "Gemini 3.5 Flash-Lite",
      inputPerMillion: 0.3,
    }),
  ]),
});

/**
 * @param {string} id
 * @returns {{ id: string, label: string, inputPerMillion: number, scope?: string }}
 */
export function resolveModel(id) {
  const models = MODEL_PRICING.models;
  const match = models.find((model) => model.id === id);
  if (match) return match;
  const fallback = models.find((model) => model.id === MODEL_PRICING.defaultModelId);
  if (!fallback) {
    throw new Error("MODEL_PRICING is missing its default model");
  }
  return fallback;
}
