import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_PRICING, resolveModel } from "../js/pricing.js";
import {
  countCharacters,
  countCodePoints,
  countWords,
  estimateCost,
  formatCount,
  formatUsd,
  renderStats,
  summarize,
} from "../js/stats.js";

test("pricing config lists verified standard input rates", () => {
  assert.equal(MODEL_PRICING.checked, "2026-10-17");
  assert.equal(MODEL_PRICING.unit, "per 1,000,000 input tokens");
  const rates = Object.fromEntries(
    MODEL_PRICING.models.map((model) => [model.id, model.inputPerMillion]),
  );
  assert.deepEqual(rates, {
    "gpt-4o-mini": 0.15,
    "gpt-6-luna": 0.1,
    "gpt-6.1-sol": 2,
    "gpt-6-astra": 10,
    "claude-haiku-5-5": 0.1,
    "claude-sonnet-5-5": 2,
    "claude-opus-5-5": 4,
    "gemini-3.5-flash-lite": 0.3,
  });
  assert.equal(resolveModel("missing-model").id, MODEL_PRICING.defaultModelId);
  assert.equal(resolveModel("gpt-6-astra").inputPerMillion, 10);
});

test("character counts use graphemes and can fall back to code points", () => {
  assert.equal(countCharacters(""), 0);
  assert.equal(countCharacters("hello"), 5);
  assert.equal(countCharacters("cafe\u0301"), 4);
  assert.equal(countCodePoints("cafe\u0301"), 5);
  assert.equal(countCharacters("👩‍👩‍👧‍👦"), 1);
  assert.equal(countCodePoints("👩‍👩‍👧‍👦") > 1, true);
  assert.equal(countCharacters("🇺🇸"), 1);
  assert.equal(countCodePoints("🇺🇸"), 2);
});

test("words are whitespace-separated", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   \n\t"), 0);
  assert.equal(countWords("one two"), 2);
  assert.equal(countWords("  one\ntwo\tthree  "), 3);
  assert.equal(countWords("don't"), 1);
});

test("cost math and formatting", () => {
  assert.equal(estimateCost(0, 10), 0);
  assert.equal(estimateCost(-5, 10), 0);
  assert.equal(estimateCost(100, -1), 0);
  assert.equal(estimateCost(Number.NaN, 1), 0);
  assert.equal(estimateCost(1_000_000, 0.15), 0.15);
  assert.equal(estimateCost(2_000_000, 10), 20);

  assert.equal(formatUsd(estimateCost(1000, 0.4)), "$0.0004");
  assert.equal(formatUsd(estimateCost(1_000_000, 0.15)), "$0.15");
  assert.equal(formatUsd(estimateCost(3, 0.15)), "$0.00000045");
  assert.equal(formatUsd(estimateCost(2_500_000, 10)), "$25.00");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(Number.NaN), "$0.00");

  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(1234567), "1,234,567");
  assert.equal(formatUsd(1234.5), "$1,234.50");
});

test("summarize counts tokens, graphemes, and words", () => {
  const summary = summarize({
    tokens: [
      { text: "Hello", id: 0 },
      { text: ",", id: 1 },
      { text: " world", id: 2 },
    ],
    text: "Hello, world",
  });
  assert.deepEqual(summary, {
    tokenCount: 3,
    characterCount: 12,
    wordCount: 2,
  });
  assert.deepEqual(summarize(null), {
    tokenCount: 0,
    characterCount: 0,
    wordCount: 0,
  });
  assert.equal(summarize({ tokens: "nope", text: "cafe\u0301" }).characterCount, 4);
});

test("renderStats rejects a missing container", () => {
  assert.throws(() => renderStats(null, { tokens: [], text: "" }), TypeError);
  assert.throws(() => renderStats({}, { tokens: [], text: "" }), TypeError);
});
