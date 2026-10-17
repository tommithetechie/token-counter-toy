/**
 * Wires #input to the tokenizer, chip, and stats modules.
 * Each import is optional so the page still runs before those files exist.
 *
 * tokenizer.js: async tokenize(text) -> [{ text, id }]
 * chips.js:     renderChips(container, tokens)
 * stats.js:     renderStats(container, { tokens, text })
 */

const INPUT_DEBOUNCE_MS = 120;

const input = document.querySelector("#input");
const chipsContainer = document.querySelector("#chips");
const statsContainer = document.querySelector("#stats");

const modules = {
  tokenize: null,
  renderChips: null,
  renderStats: null,
};

let modulesPromise = null;
let requestId = 0;

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

async function importOptional(specifier) {
  try {
    return await import(specifier);
  } catch {
    return null;
  }
}

function pickExport(mod, name) {
  if (!mod || typeof mod[name] !== "function") return null;
  return mod[name];
}

function resolveModules() {
  if (!modulesPromise) {
    modulesPromise = (async () => {
      const [tokenizer, chips, stats] = await Promise.all([
        importOptional("./tokenizer.js"),
        importOptional("./chips.js"),
        importOptional("./stats.js"),
      ]);
      modules.tokenize = pickExport(tokenizer, "tokenize");
      modules.renderChips = pickExport(chips, "renderChips");
      modules.renderStats = pickExport(stats, "renderStats");
    })();
  }
  return modulesPromise;
}

function fallbackTokenize(text) {
  if (!text) return [];
  const parts = text.match(/\s+|\S+/g);
  if (!parts) return [];
  return parts.map((part, id) => ({ text: part, id }));
}

function fallbackRenderChips(container, tokens) {
  const fragment = document.createDocumentFragment();
  if (tokens.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Tokens show up here.";
    fragment.append(empty);
  } else {
    for (const token of tokens) {
      const chip = document.createElement("span");
      chip.className = "fallback-token";
      const label = token && typeof token.text === "string" ? token.text : "";
      if (token && token.id != null) chip.dataset.tokenId = String(token.id);
      chip.textContent = label;
      fragment.append(chip);
    }
  }
  container.replaceChildren(fragment);
}

function fallbackRenderStats(container, { tokens, text }) {
  const rows = [
    ["Tokens", String(Array.isArray(tokens) ? tokens.length : 0)],
    ["Characters", String(text.length)],
  ];
  const list = document.createElement("dl");
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    list.append(term, detail);
  }
  container.replaceChildren(list);
}

function safeTokens(value, text) {
  return Array.isArray(value) ? value : fallbackTokenize(text);
}

async function refresh() {
  if (!input || !chipsContainer || !statsContainer) return;

  const current = ++requestId;
  const text = input.value;

  await resolveModules();
  if (current !== requestId) return;

  let tokens;
  if (modules.tokenize) {
    try {
      tokens = safeTokens(await modules.tokenize(text), text);
    } catch {
      tokens = fallbackTokenize(text);
    }
  } else {
    tokens = fallbackTokenize(text);
  }
  if (current !== requestId) return;

  try {
    if (modules.renderChips) await modules.renderChips(chipsContainer, tokens);
    else fallbackRenderChips(chipsContainer, tokens);
  } catch {
    if (current !== requestId) return;
    fallbackRenderChips(chipsContainer, tokens);
  }
  if (current !== requestId) return;

  try {
    if (modules.renderStats) {
      await modules.renderStats(statsContainer, { tokens, text });
    } else {
      fallbackRenderStats(statsContainer, { tokens, text });
    }
  } catch {
    if (current !== requestId) return;
    fallbackRenderStats(statsContainer, { tokens, text });
  }
}

function safeRefresh() {
  refresh().catch(() => {});
}

function boot() {
  if (!input) return;
  input.addEventListener("input", debounce(safeRefresh, INPUT_DEBOUNCE_MS));
  safeRefresh();
}

boot();
