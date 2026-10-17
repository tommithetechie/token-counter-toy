import { MODEL_PRICING, resolveModel } from "./pricing.js";

/** localStorage key for the model picker. */
export const MODEL_STORAGE_KEY = "token-counter-toy.model";

const graphemeSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

const countFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

const rateFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * User-perceived characters (grapheme clusters). Falls back to Unicode
 * code points when Intl.Segmenter is missing.
 * @param {string} text
 * @returns {number}
 */
export function countCharacters(text) {
  const value = text == null ? "" : String(text);
  if (!graphemeSegmenter) return countCodePoints(value);
  let count = 0;
  for (const _segment of graphemeSegmenter.segment(value)) {
    count += 1;
  }
  return count;
}

/**
 * Unicode code points, not UTF-16 code units.
 * @param {string} text
 * @returns {number}
 */
export function countCodePoints(text) {
  const value = text == null ? "" : String(text);
  let count = 0;
  for (const _char of value) count += 1;
  return count;
}

/**
 * Whitespace-separated words. Empty and whitespace-only text counts as zero.
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  const value = text == null ? "" : String(text).trim();
  if (!value) return 0;
  return value.split(/\s+/).length;
}

/**
 * USD cost of `tokenCount` input tokens at `inputPerMillion` dollars per 1M.
 * @param {number} tokenCount
 * @param {number} inputPerMillion
 * @returns {number}
 */
export function estimateCost(tokenCount, inputPerMillion) {
  const tokens = Number(tokenCount);
  const rate = Number(inputPerMillion);
  if (!Number.isFinite(tokens) || !Number.isFinite(rate)) return 0;
  if (tokens <= 0 || rate < 0) return 0;
  return (tokens / 1_000_000) * rate;
}

/**
 * Integer with thousands separators, for example 1234567 → "1,234,567".
 * @param {number} value
 * @returns {string}
 */
export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return countFormatter.format(n);
}

/**
 * Dollars with thousands separators. Sub-cent amounts keep enough decimals
 * to stay visible, for example 0.0004 → "$0.0004".
 * @param {number} amount
 * @returns {string}
 */
export function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "$0.00";
  return usdFormatter.format(n);
}

/**
 * @param {{ tokens?: { text: string, id: number }[], text?: string } | null | undefined} source
 * @returns {{ tokenCount: number, characterCount: number, wordCount: number }}
 */
export function summarize(source) {
  const input = source && typeof source === "object" ? source : {};
  const tokens = Array.isArray(input.tokens) ? input.tokens : [];
  const text = input.text == null ? "" : String(input.text);
  return {
    tokenCount: tokens.length,
    characterCount: countCharacters(text),
    wordCount: countWords(text),
  };
}

/**
 * Fill `container` with token, character, and word counts, a model picker,
 * and a rough input-cost estimate. The chosen model is kept in localStorage.
 * @param {Element} container
 * @param {{ tokens?: { text: string, id: number }[], text?: string }} [source]
 */
export function renderStats(container, source) {
  if (!container || typeof container.replaceChildren !== "function") {
    throw new TypeError("renderStats expects an element to render into");
  }

  const { tokenCount, characterCount, wordCount } = summarize(source);
  const selected = resolveModel(readModelId());

  const modelRow = document.createElement("label");
  modelRow.className = "stat";

  const modelLabel = document.createElement("span");
  modelLabel.className = "stat__label";
  modelLabel.textContent = "Model";

  const select = document.createElement("select");
  select.className = "stat__select";
  select.name = "model";

  for (const model of MODEL_PRICING.models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = modelOptionLabel(model);
    select.append(option);
  }
  select.value = selected.id;

  modelRow.append(modelLabel, select);

  const costRow = statRow(
    "cost",
    "Rough estimate",
    formatUsd(estimateCost(tokenCount, selected.inputPerMillion)),
  );
  const costValue = costRow.querySelector(".stat__value");
  costValue.setAttribute("aria-live", "polite");

  select.addEventListener("change", () => {
    const model = resolveModel(select.value);
    writeModelId(model.id);
    costValue.textContent = formatUsd(estimateCost(tokenCount, model.inputPerMillion));
  });

  const note = document.createElement("p");
  note.className = "stat__note";
  note.textContent =
    "Rough estimate from the standard input price. Output tokens, caching, and long-context rates are not included.";

  container.replaceChildren(
    modelRow,
    statRow("tokens", "Tokens", formatCount(tokenCount)),
    statRow("characters", "Characters", formatCount(characterCount)),
    statRow("words", "Words", formatCount(wordCount)),
    costRow,
    note,
  );
}

/**
 * @param {string} key
 * @param {string} label
 * @param {string} value
 * @returns {HTMLParagraphElement}
 */
function statRow(key, label, value) {
  const row = document.createElement("p");
  row.className = "stat";
  row.dataset.stat = key;

  const labelEl = document.createElement("span");
  labelEl.className = "stat__label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "stat__value";
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

/**
 * @param {{ label: string, inputPerMillion: number, scope?: string }} model
 * @returns {string}
 */
function modelOptionLabel(model) {
  const price = `${rateFormatter.format(model.inputPerMillion)} / 1M`;
  if (model.scope) return `${model.label} (${price}, ${model.scope})`;
  return `${model.label} (${price})`;
}

function readModelId() {
  try {
    return globalThis.localStorage?.getItem(MODEL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * @param {string} id
 */
function writeModelId(id) {
  try {
    globalThis.localStorage?.setItem(MODEL_STORAGE_KEY, id);
  } catch {
    // Private mode and some embedded browsers reject storage writes.
  }
}
