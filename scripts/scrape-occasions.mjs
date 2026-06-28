/**
 * Scrapes Kapruka's curated recipient/occasion pages into data/occasions.json.
 *
 * Usage:
 *   node scripts/scrape-occasions.mjs
 *
 * Unlike scripts/parse-har.mjs, these pages are fully server-rendered and public,
 * so this fetches them directly over HTTP — no HAR capture needed. Safe to re-run
 * (or cron) to refresh the curated lists when Kapruka's merchandisers update them.
 *
 * Output shape (data/occasions.json):
 *   {
 *     "<slug>": {
 *       "label": "Mother",
 *       "sections": [ { "name": "fashion and cosmetics", "ids": ["FASHION0010567", ...] }, ... ]
 *     }
 *   }
 *
 * The product IDs are the last `/buyonline/<slug>/kid/<ID>` path segment, uppercased
 * — identical to the IDs the MCP `kapruka_get_product` tool expects.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'occasions.json');

const BASE = 'https://www.kapruka.com/online/';
const MAX_PER_SECTION = 12; // enough for a card row + load-more; keeps the file lean

// Recipient/occasion pages from https://www.kapruka.com/shops/events_home.jsp
// `bestsellers` is intentionally omitted — already covered by curated.json best_sellers.
const PAGES = {
  mother: 'Mother',
  father: 'Father',
  kid: 'Kids',
  newborn: 'New Baby',
  lover: 'Sweetheart',
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  wedding: 'Wedding',
  graduation: 'Graduation',
  sympathies: 'Sympathy',
  bridetobe: 'Bride to Be',
  momtobe: 'Mom to Be',
  corporate: 'Corporate',
  newyear: 'New Year',
  christmas: 'Christmas',
  childrensday: "Children's Day",
  teachersday: "Teacher's Day",
  womenday: "Women's Day",
};

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract /buyonline/<slug>/kid/<ID> product IDs from an HTML fragment, in order. */
function extractIds(fragment) {
  const ids = [];
  for (const m of fragment.matchAll(/buyonline\/[^/"']+\/kid\/([^/"'&\s<>]+)/g)) {
    ids.push(m[1].toUpperCase());
  }
  return ids;
}

/**
 * Normalise a section heading like "FATHER FASHION AND COSMETICS" → "fashion and
 * cosmetics" by stripping a leading occasion-word prefix (the page's own label words).
 */
function cleanSectionName(rawTitle, label) {
  let s = rawTitle.replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  // Strip leading occasion words derived from the human label and common synonyms.
  const prefixWords = new Set(
    [...label.toLowerCase().split(/[^a-z]+/), 'mother', 'mom', 'father', 'dad',
     'baby', 'newborn', 'new', 'born', 'kids', 'kid', 'wedding', 'birthday',
     'anniversary', 'lover', 'sweetheart'].filter(Boolean),
  );
  const words = s.split(' ');
  while (words.length > 1 && prefixWords.has(words[0])) words.shift();
  return words.join(' ').trim();
}

/** Parse one occasion page into ordered { name, ids } sections. */
function parsePage(html, label) {
  const headingRe = /<h2[^>]*class=['"]event_title['"][^>]*>([^<]+)<\/h2>/gi;
  const headings = [...html.matchAll(headingRe)];

  const byName = new Map(); // name → ids[], preserves first-seen order
  const seen = new Set(); // dedupe IDs across the whole page (a product belongs to one section)

  const pushSection = (name, fragment) => {
    if (!name) return;
    const bucket = byName.get(name) ?? [];
    for (const id of extractIds(fragment)) {
      if (seen.has(id) || bucket.length >= MAX_PER_SECTION) continue;
      seen.add(id);
      bucket.push(id);
    }
    if (bucket.length && !byName.has(name)) byName.set(name, bucket);
  };
  const finish = () => [...byName].filter(([, ids]) => ids.length >= 2).map(([name, ids]) => ({ name, ids }));

  if (headings.length === 0) {
    // No section separators — treat the whole page as one "featured" list.
    pushSection('featured', html);
    return finish();
  }

  // Products appearing before the first heading → "top sellers".
  pushSection('top sellers', html.slice(0, headings[0].index));

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index + headings[i][0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : html.length;
    pushSection(cleanSectionName(headings[i][1], label), html.slice(start, end));
  }
  return finish();
}

async function fetchPage(slug) {
  const res = await fetch(BASE + slug, { headers: { 'User-Agent': 'Mozilla/5.0 (ruki-curation-bot)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${slug}`);
  return res.text();
}

// ── main ──────────────────────────────────────────────────────────────────────

const out = {};
for (const [slug, label] of Object.entries(PAGES)) {
  try {
    const html = await fetchPage(slug);
    const sections = parsePage(html, label);
    const total = sections.reduce((n, s) => n + s.ids.length, 0);
    if (total === 0) {
      console.warn(`! ${slug}: 0 products (page shape may have changed) — skipped`);
      continue;
    }
    out[slug] = { label, sections };
    console.log(`✓ ${slug.padEnd(12)} ${sections.length} sections, ${total} products`);
  } catch (err) {
    console.warn(`! ${slug}: ${err.message} — skipped`);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`→ Written ${Object.keys(out).length} occasions to ${OUT}`);
