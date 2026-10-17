/**
 * Browser tokenizer for the token-counter toy.
 *
 * Uses gpt-tokenizer (o200k_base, the encoding behind GPT-4o, GPT-4.1, and
 * GPT-5) loaded as a pinned ES module from jsDelivr. No build step.
 *
 * Pieces always concatenate back to the original string. A token that is only
 * a fragment of a multi-byte sequence (common for emoji) has an empty `text`;
 * the character is attached to the token that completes the sequence.
 */

export const ENCODING = 'o200k_base';

const TOKENIZER_VERSION = '4.0.3';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/gpt-tokenizer@${TOKENIZER_VERSION}/esm`;

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

let codecPromise;

function loadCodec() {
  if (!codecPromise) {
    codecPromise = loadCodecOnce().catch((error) => {
      codecPromise = undefined;
      throw error;
    });
  }
  return codecPromise;
}

async function loadCodecOnce() {
  const [api, ranksModule] = await Promise.all([
    import(`${CDN_BASE}/encoding/${ENCODING}.js`),
    import(`${CDN_BASE}/bpeRanks/${ENCODING}.js`),
  ]);

  return {
    encode: api.encode,
    allowedSpecial: api.ALL_SPECIAL_TOKENS,
    ranks: ranksModule.default,
    specialById: specialTokenMap(api),
  };
}

function specialTokenMap(api) {
  const labels = [
    api.EndOfText,
    api.FimPrefix,
    api.FimMiddle,
    api.FimSuffix,
    api.ImStart,
    api.ImEnd,
    api.ImSep,
    api.EndOfPrompt,
  ];
  const map = new Map();
  for (const label of labels) {
    if (typeof label !== 'string' || label.length === 0) continue;
    const ids = api.encode(label, { allowedSpecial: api.ALL_SPECIAL_TOKENS });
    if (ids.length === 1) map.set(ids[0], label);
  }
  return map;
}

function endsWithHighSurrogate(value) {
  if (value.length === 0) return false;
  const code = value.charCodeAt(value.length - 1);
  return code >= HIGH_SURROGATE_START && code <= HIGH_SURROGATE_END;
}

function pieceForToken(id, codec, decoder) {
  const special = codec.specialById.get(id);
  if (special !== undefined) return special;

  const value = codec.ranks[id];
  if (typeof value === 'string') return value;
  if (value != null) {
    const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);
    return decoder.decode(bytes, { stream: true });
  }
  throw new Error(`Unknown ${ENCODING} token id: ${id}`);
}

/**
 * Split `text` into o200k_base tokens.
 * @param {string} text
 * @returns {Promise<Array<{ text: string, id: number }>>}
 */
export async function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const codec = await loadCodec();
  const ids = codec.encode(text, { allowedSpecial: codec.allowedSpecial });
  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
  const tokens = new Array(ids.length);
  let carry = '';

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    let piece = carry + pieceForToken(id, codec, decoder);
    carry = '';
    if (endsWithHighSurrogate(piece)) {
      carry = piece;
      piece = '';
    }
    tokens[i] = { text: piece, id };
  }

  const tail = carry + decoder.decode();
  if (tail.length > 0 && tokens.length > 0) {
    tokens[tokens.length - 1].text += tail;
  }

  return tokens;
}
