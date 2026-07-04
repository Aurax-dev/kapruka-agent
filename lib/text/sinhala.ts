/**
 * Gemini occasionally emits **Malayalam** codepoints (U+0D00–U+0D7F) inside
 * Sinhala words — the Malayalam block sits immediately below the Sinhala block
 * (U+0D80–U+0DFF), and the model slips into the neighbour for rare conjuncts.
 * Observed in the wild: "අයියෝ" came back as "අය്യෝ", where the virama (U+0D4D)
 * and ya (U+0D2F) were Malayalam, not Sinhala. Fonts render those as Malayalam
 * glyphs or tofu, so the word looks broken.
 *
 * This app only ever replies in English, Sinhala, or Tamil — and Tamil lives in
 * a separate block (U+0B80–U+0BFF). So any Malayalam codepoint is definitively a
 * generation error, and remapping it to the phonetically-equivalent Sinhala
 * letter is safe. The map covers vowels, consonants, dependent signs, and the
 * virama; Dravidian-only letters (റ, ഴ) fall back to their nearest Sinhala match.
 *
 * The remap is per-codepoint, so it is safe to apply to individual stream deltas.
 */
const MALAYALAM_TO_SINHALA = new Map<number, number>([
  // signs
  [0x0d02, 0x0d82], [0x0d03, 0x0d83],
  // independent vowels
  [0x0d05, 0x0d85], [0x0d06, 0x0d86], [0x0d07, 0x0d89], [0x0d08, 0x0d8a],
  [0x0d09, 0x0d8b], [0x0d0a, 0x0d8c], [0x0d0b, 0x0d8d], [0x0d0e, 0x0d91],
  [0x0d0f, 0x0d92], [0x0d10, 0x0d93], [0x0d12, 0x0d94], [0x0d13, 0x0d95],
  [0x0d14, 0x0d96],
  // consonants
  [0x0d15, 0x0d9a], [0x0d16, 0x0d9b], [0x0d17, 0x0d9c], [0x0d18, 0x0d9d],
  [0x0d19, 0x0d9e], [0x0d1a, 0x0da0], [0x0d1b, 0x0da1], [0x0d1c, 0x0da2],
  [0x0d1d, 0x0da3], [0x0d1e, 0x0da4], [0x0d1f, 0x0da7], [0x0d20, 0x0da8],
  [0x0d21, 0x0da9], [0x0d22, 0x0daa], [0x0d23, 0x0dab], [0x0d24, 0x0dad],
  [0x0d25, 0x0dae], [0x0d26, 0x0daf], [0x0d27, 0x0db0], [0x0d28, 0x0db1],
  [0x0d2a, 0x0db4], [0x0d2b, 0x0db5], [0x0d2c, 0x0db6], [0x0d2d, 0x0db7],
  [0x0d2e, 0x0db8], [0x0d2f, 0x0dba], [0x0d30, 0x0dbb], [0x0d31, 0x0dbb],
  [0x0d32, 0x0dbd], [0x0d33, 0x0dc5], [0x0d34, 0x0dc5], [0x0d35, 0x0dc0],
  [0x0d36, 0x0dc1], [0x0d37, 0x0dc2], [0x0d38, 0x0dc3], [0x0d39, 0x0dc4],
  // dependent vowel signs + virama
  [0x0d3e, 0x0dcf], [0x0d3f, 0x0dd2], [0x0d40, 0x0dd3], [0x0d41, 0x0dd4],
  [0x0d42, 0x0dd6], [0x0d43, 0x0dd8], [0x0d46, 0x0dd9], [0x0d47, 0x0dda],
  [0x0d48, 0x0ddb], [0x0d4a, 0x0ddc], [0x0d4b, 0x0ddd], [0x0d4c, 0x0dde],
  [0x0d4d, 0x0dca],
]);

/**
 * Remap stray Malayalam codepoints to their Sinhala equivalents. No-op for text
 * with no Malayalam characters (the common case), so cheap to call on every delta.
 */
export function normalizeSinhalaScript(input: string): string {
  let out = "";
  let changed = false;
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    const mapped = MALAYALAM_TO_SINHALA.get(cp);
    if (mapped !== undefined) {
      out += String.fromCodePoint(mapped);
      changed = true;
    } else {
      out += ch;
    }
  }
  return changed ? out : input;
}
