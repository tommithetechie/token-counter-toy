/**
 * Render tokenizer output as colored inline chips.
 *
 * Structure only lives here (inline-block, padding, radius, whitespace).
 * Theme colors come from `--chip-0` … `--chip-5`, with light fallbacks so
 * chips stay readable before the CRT stylesheet sets those variables.
 * `--chip-ink` optionally overrides the text color.
 */

const COLOR_COUNT = 6;
const STYLE_ID = 'token-chip-styles';

const CHIP_CSS = `
.chip {
  display: inline-block;
  box-sizing: border-box;
  margin: 0.08em 0.06em;
  padding: 0.06em 0.28em;
  border-radius: 0.35em;
  line-height: 1.45;
  vertical-align: baseline;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--chip-ink, #24180c);
  background: var(--chip-0, #f3d7a1);
}
.chip--0 { background: var(--chip-0, #f3d7a1); }
.chip--1 { background: var(--chip-1, #7ec8c3); }
.chip--2 { background: var(--chip-2, #f6e27a); }
.chip--3 { background: var(--chip-3, #f0b7a4); }
.chip--4 { background: var(--chip-4, #b7d99a); }
.chip--5 { background: var(--chip-5, #c5c1ea); }
.chip--empty {
  display: inline;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
}
`;

function ensureChipStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CHIP_CSS;
  (document.head || document.documentElement).appendChild(style);
}

function visibleText(text) {
  return text.replaceAll('\r', '␍');
}

function appendChip(parent, text, id, index) {
  const span = document.createElement('span');
  const color = ((index % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT;
  span.className = text.length === 0
    ? `chip chip--${color} chip--empty`
    : `chip chip--${color}`;
  span.title = String(id);
  span.textContent = text;
  parent.appendChild(span);
}

/**
 * Paint `tokens` into `container`, replacing whatever was there.
 * Newlines break the line. A newline-only segment shows ↵ so the token
 * stays visible. Spaces and tabs stay in the chip and show through
 * `white-space: pre-wrap`.
 *
 * @param {HTMLElement} container
 * @param {Array<{ text?: string, id?: number }>} tokens
 */
export function renderChips(container, tokens) {
  if (!container || typeof container.replaceChildren !== 'function') {
    throw new TypeError('renderChips expects an element');
  }
  ensureChipStyles();

  const frag = document.createDocumentFragment();
  const list = Array.isArray(tokens) ? tokens : [];

  for (let i = 0; i < list.length; i++) {
    const token = list[i] ?? {};
    const id = token.id;
    const text = typeof token.text === 'string' ? token.text : '';

    if (text.length === 0 || !text.includes('\n')) {
      appendChip(frag, visibleText(text), id, i);
      continue;
    }

    const parts = text.split('\n');
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) frag.appendChild(document.createElement('br'));
      const part = parts[p];
      const isLast = p === parts.length - 1;
      if (part.length > 0) appendChip(frag, visibleText(part), id, i);
      else if (!isLast) appendChip(frag, '↵', id, i);
    }
  }

  container.replaceChildren(frag);
}
