/**
 * Kapruka product data has a specific double-encoding bug:
 *   1. UTF-8 text was decoded as CP1252 (mojibake), e.g. é → Ã©
 *   2. Each mojibaked character was HTML-entity-encoded: Ã → &#195;, © → &#169;
 *   3. The `&` was replaced with `n` (or `N` at word boundaries): n#195;n#169;
 *
 * Reversing: map each numeric code back to its raw byte via the CP1252 table,
 * then UTF-8-decode the byte sequence.
 */

// CP1252 codepoints in 0x80–0x9F range → raw byte. Outside this range, codepoint === byte.
const CP1252_TO_BYTE = new Map<number, number>([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
  [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
  [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
  [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

// Reverse lookup: raw byte → Unicode codepoint (for the UTF-8 decode fallback)
const BYTE_TO_CP = new Map<number, number>(
  [...CP1252_TO_BYTE.entries()].map(([cp, b]) => [b, cp])
);

function decodeKaprukaEntities(input: string): string {
  // Match runs of consecutive [Nn]#digits; or &#digits; patterns
  return input.replace(/(?:[Nn&]#\d+;)+/g, (match) => {
    const bytes: number[] = [];
    const re = /[Nn&]#(\d+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(match)) !== null) {
      const cp = parseInt(m[1], 10);
      const byte = CP1252_TO_BYTE.get(cp) ?? (cp <= 0xFF ? cp : -1);
      if (byte < 0) return match; // codepoint out of byte range — leave intact
      bytes.push(byte);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch {
      // Bytes aren't valid UTF-8 — map each byte back to its Unicode codepoint directly
      return bytes.map(b => String.fromCodePoint(BYTE_TO_CP.get(b) ?? b)).join('');
    }
  });
}

// Fallback: plain mojibake patterns that bypassed entity encoding
const MOJIBAKE: [RegExp, string][] = [
  [/â€™/g, '’'], // '
  [/â€œ/g, '“'], // "
  [/â€/g,  '”'], // "
  [/â€"/g, '–'], // –
  [/â€"/g, '—'], // —
  [/Ã©/g,  'é'], // é
  [/Ã¨/g,  'è'], // è
  [/Ã /g,  'à'], // à
  [/Ã¢/g,  'â'], // â
];

export function cleanText(input: string): string {
  let out = decodeKaprukaEntities(input);
  for (const [pattern, replacement] of MOJIBAKE) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

const PREFIX = /^[a-z]+ - [A-Za-z]+,\s*[A-Za-z]+\s+/;

export function stripSummaryPrefix(input: string): string {
  return input.replace(PREFIX, '');
}
