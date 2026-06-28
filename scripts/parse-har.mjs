/**
 * Parses Kapruka HAR captures into data/curated.json.
 *
 * Usage:
 *   node scripts/parse-har.mjs
 *
 * Expects the following files in temp/:
 *   www.kapruka.com-best-sellers.har
 *   www.kapruka.com-promotions.har
 *   www.kapruka.com-same-day-delivery.har
 *
 * For daily refresh: replace the HAR files and re-run this script.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMP = join(ROOT, 'temp');
const OUT  = join(ROOT, 'data', 'curated.json');

const MAX_SAME_DAY    = 60;
const MAX_BEST_SELLER = 30;
const MAX_PROMOTIONS  = 30;

// ── helpers ──────────────────────────────────────────────────────────────────

function loadHar(name) {
  const path = join(TEMP, `www.kapruka.com-${name}.har`);
  if (!existsSync(path)) throw new Error(`Missing HAR file: ${path}`);
  const har = JSON.parse(readFileSync(path, 'utf8'));
  // First entry is always the main page HTML
  return har.log.entries[0].response.content.text;
}

/** Extract all /buyonline/slug/kid/ID links in document order (deduped). */
function extractLinks(html) {
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(/buyonline\/([^/"']+)\/kid\/([^/"'&\s<>]+)/g)) {
    const id = m[2].toUpperCase();
    if (!seen.has(id)) { seen.add(id); out.push({ slug: m[1], id }); }
  }
  return out;
}

/** Parse Rs price strings like "Rs&nbsp;30,000" or "RS.15,900" → number */
function parseRs(str) {
  const n = str.replace(/[Rrs\s&nbsp;,.]/gi, '').replace('RS', '').replace('Rs', '');
  const digits = n.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

// ── parsers ───────────────────────────────────────────────────────────────────

function parseBestSellers() {
  const html = loadHar('best-sellers');
  return extractLinks(html).slice(0, MAX_BEST_SELLER).map(p => p.id);
}

function parsePromotions() {
  const html = loadHar('promotions');
  const links = extractLinks(html).slice(0, MAX_PROMOTIONS);

  return links.map(({ id }) => {
    // Find the anchor block for this product
    const anchor = `data-dfid="${id.toLowerCase()}"`;
    const start = html.indexOf(anchor);
    if (start === -1) return { id, compare_price: null };

    const block = html.slice(start, start + 3000);

    // Market/original price: <del>Rs&nbsp;30,000</del>
    const mktMatch = block.match(/<del>([^<]+)<\/del>/i);
    const comparePrice = mktMatch ? parseRs(mktMatch[1]) : null;

    return { id, compare_price: comparePrice };
  }).filter(p => p.id);
}

function parseSameDay() {
  const html = loadHar('same-day-delivery');
  return extractLinks(html).slice(0, MAX_SAME_DAY).map(p => p.id);
}

// ── main ──────────────────────────────────────────────────────────────────────

const bestSellers = parseBestSellers();
const promotions  = parsePromotions();
const sameDay     = parseSameDay();

const output = {
  best_sellers: bestSellers,
  promotions,
  same_day: sameDay,
};

writeFileSync(OUT, JSON.stringify(output, null, 2));

console.log(`✓ best_sellers: ${bestSellers.length} products`);
console.log(`✓ promotions:   ${promotions.length} products (${promotions.filter(p => p.compare_price).length} with discount data)`);
console.log(`✓ same_day:     ${sameDay.length} products`);
console.log(`→ Written to ${OUT}`);
