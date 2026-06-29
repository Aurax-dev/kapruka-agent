/**
 * Scrapes Kapruka's company-info / policy / FAQ pages into data/kapruka-info.json.
 *
 * Usage:
 *   node scripts/scrape-kapruka-info.mjs
 *
 * This feeds Ruki's `get_kapruka_info` tool (lib/kapruka/info.ts) — a read-only
 * knowledge base the agent consults when a user asks about company info, contact
 * details, return/refund policies, or any "how does X work" FAQ question. It is
 * NOT part of the product search/purchase path.
 *
 * Like scripts/scrape-occasions.mjs, the public pages are server-rendered, so this
 * fetches them directly over HTTP. Safe to re-run (or cron) to refresh the content.
 *
 * Three sources, three extraction strategies:
 *   • FAQ   (https://www.kapruka.com/shop/faq + 21 topic pages) — clean, consistent
 *           `kp-faq-wrap` markup (<h2> sections, <h3> questions, following text =
 *           answers). Scraped deterministically.
 *   • Policies (returns-refunds-…) — WordPress `colibri-post-content`, parsed by its
 *           <h2>/<h3>/<h4> headings into sections.
 *   • About  (contactUs/about.html) — a heavily inline-styled marketing page that
 *           does not parse into clean fields, so the stable facts (overview, mission,
 *           vision, services, offices/contacts) are CURATED as constants below,
 *           verified against the live page. Edit them here if the page changes.
 *
 * Output shape (data/kapruka-info.json):
 *   {
 *     "about":    { "summary", "mission", "vision", "services": [...] },
 *     "contact":  { "email", "hotline", "whatsapp", "offices": [{country,address,phone}] },
 *     "policies": { "<slug>": { "title", "text" }, ... },
 *     "faq":      [ { "category", "url", "summary", "qa": [{q,a}, ...] }, ... ]
 *   }
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'kapruka-info.json');
const UA = 'Mozilla/5.0 (ruki-curation-bot)';

// ── Curated company facts (about page is marketing HTML; verified against source) ──
const ABOUT = {
  summary:
    "Kapruka is Sri Lanka's largest homegrown online gift and shopping platform. Dulith Herath " +
    'incorporated it in 2002 (as Lanka Dot Info) and launched the e-commerce site in 2003 — the ' +
    "country's first homegrown e-commerce platform. Kapruka Holdings PLC went public in 2021 (raising " +
    'LKR 505.5 million) and trades on the Colombo Stock Exchange as KPHL. Today it spans 125,000+ ' +
    'products and 500+ brands, with offices in five countries and its own delivery, productions, and ' +
    'technology arms.',
  mission:
    'To improve the everyday lives of millions by creating seamless digital shopping experiences — ' +
    'connecting Sri Lankan consumers and the global diaspora to the products, brands, and services they love.',
  vision:
    'To be the definitive digital commerce gateway for Sri Lanka — a borderless platform where every ' +
    'click opens a world of choices.',
  services: [
    'Kapruka E-Commerce — flagship retail platform, 125,000+ products across every category',
    'Kapruka Productions — in-house cakes, floral arrangements, and value-added produce',
    'Kapruka Cross Border — lets Sri Lankan brands sell globally',
    'Global Shop — lets local customers buy from international retailers',
    'Partner Central — platform for 500+ supplier brands',
    'Grasshoppers Delivery — same-day and next-day island-wide delivery',
    'Kapruka Techroot — technology infrastructure arm',
  ],
};

const CONTACT = {
  email: 'info@kapruka.com',
  hotline: '+94 11 755 1111',
  whatsapp: '070 285 5000',
  offices: [
    { country: 'Sri Lanka (HQ)', address: '147 Kottawa Road, Nugegoda', phone: '+94 11 755 1111' },
    { country: 'United Kingdom', address: '145-157 St John St, London EC1V 4PY', phone: '+44 203 769 0961' },
    { country: 'United States', address: '24000 Mercantile Rd, Beachwood, OH', phone: '+1 888 502 5244' },
    { country: 'Australia', address: '440 Collins St, L9, Melbourne VIC', phone: '+61 391 112 322' },
    { country: 'Canada', address: '700 9th Street SW, Calgary, Alberta', phone: '+1 587 598 3913' },
  ],
};

const POLICIES_URL = 'https://www.kapruka.com/shop/returns-refunds-and-other-policies-of-kapruka';

// FAQ index → topic pages (from https://www.kapruka.com/shop/faq).
const FAQ_PAGES = [
  ['General', 'https://www.kapruka.com/shop/home-faq/'],
  ['Clothing', 'https://www.kapruka.com/shop/clothing-faq/'],
  ['Electronics', 'https://www.kapruka.com/shop/electronicsfaq/'],
  ['Grocery & Hampers', 'https://www.kapruka.com/shop/kapruka-grocery-faqs/'],
  ['Fashion', 'https://www.kapruka.com/shop/fashion-faq/'],
  ['Food & Restaurants', 'https://www.kapruka.com/shop/foods-faq/'],
  ['Fruits', 'https://www.kapruka.com/shop/fruits-faq/'],
  ['Pharmacy', 'https://www.kapruka.com/faq/pharmacy'],
  ['Home & Lifestyle', 'https://www.kapruka.com/shop/homelifestyle_faq/'],
  ['Books & Stationery', 'https://www.kapruka.com/shop/kapruka-books-faq/'],
  ['Sports & Bicycles', 'https://www.kapruka.com/shop/sports'],
  ['Mother & Baby', 'https://www.kapruka.com/faq/mother-baby'],
  ['Jewellery & Watches', 'https://www.kapruka.com/shop/watches_jewelry-faq/'],
  ['Cosmetics & Perfumes', 'https://www.kapruka.com/shop/cosmetics-faq/'],
  ['Cakes', 'https://www.kapruka.com/shop/cake-faqs/'],
  ['Flowers', 'https://www.kapruka.com/shop/flowers-faq/'],
  ['Chocolates', 'https://www.kapruka.com/shop/chocolates-faq/'],
  ['Customized Gifts', 'https://www.kapruka.com/shop/personalized_gifts-faq/'],
  ['Greeting Cards & Party Supplies', 'https://www.kapruka.com/faq/cards'],
  ['Gift Sets and Boxes', 'https://www.kapruka.com/faq/gift-boxes'],
  ['Soft Toys & Kids Toys', 'https://www.kapruka.com/faq/kids-toys'],
];

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Strip tags + decode the handful of entities these pages use → clean one-line text. */
function htmlToText(html) {
  return html
    .replace(/<a\b[^>]*>\s*Kapruka\s*<\/a>/gi, ' ') // citation-link noise on the policies page
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(?:#8217|#8216|rsquo|lsquo);/gi, "'")
    .replace(/&(?:#8220|#8221|rdquo|ldquo);/gi, '"')
    .replace(/&(?:#8211|#8212|ndash|mdash);/gi, '—')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Split a content fragment into sections at its <h2>/<h3>/<h4> headings.
 * Returns [{ title, text }] for every heading whose body has real prose.
 */
function sectionsByHeadings(fragment) {
  const re = /<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const heads = [...fragment.matchAll(re)];
  const out = [];
  for (let i = 0; i < heads.length; i++) {
    const title = htmlToText(heads[i][2]);
    const start = heads[i].index + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : fragment.length;
    const text = htmlToText(fragment.slice(start, end));
    if (title && text.length > 20) out.push({ title, text });
  }
  return out;
}

/** Carve out a <tag class="…name…"> … block (div OR section), good enough for these pages. */
function sliceClass(html, className) {
  const open = new RegExp(`<(?:div|section|article)[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>`, 'i');
  const m = open.exec(html);
  if (!m) return '';
  const from = m.index + m[0].length;
  // Cut at the first <script> after the block — these content blocks are followed by one.
  const scriptAt = html.slice(from).search(/<script\b/i);
  return scriptAt === -1 ? html.slice(from) : html.slice(from, from + scriptAt);
}

// ── policies ───────────────────────────────────────────────────────────────────

async function scrapePolicies() {
  const html = await fetchPage(POLICIES_URL);
  const content = sliceClass(html, 'colibri-post-content');
  const sections = sectionsByHeadings(content);
  const policies = {};
  for (const { title, text } of sections) {
    policies[slugify(title)] = { title, text };
  }
  return policies;
}

// ── faq ──────────────────────────────────────────────────────────────────────

/**
 * Walk a fragment's headings, treating `qLevel` headings as questions and (optionally)
 * `sectionLevel` headings as the section a question sits under. The answer is the text
 * between a question heading and the next heading of either tracked level.
 */
function walkQa(fragment, qLevel, sectionLevel) {
  const levels = sectionLevel ? `${qLevel}${sectionLevel}` : qLevel;
  const re = new RegExp(`<h([${levels}])\\b[^>]*>([\\s\\S]*?)<\\/h\\1>`, 'gi');
  const marks = [...fragment.matchAll(re)];
  const qa = [];
  let section = '';
  for (let i = 0; i < marks.length; i++) {
    const heading = htmlToText(marks[i][2]).replace(/^\d+[.)]\s*/, ''); // drop "12. " numbering
    if (marks[i][1] === sectionLevel) {
      section = heading;
      continue;
    }
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : fragment.length;
    const a = htmlToText(fragment.slice(start, end));
    if (heading && a.length > 20) qa.push(section ? { section, q: heading, a } : { q: heading, a });
  }
  return qa;
}

/**
 * Whole-document fallback for WordPress FAQ pages: questions are headings carrying the
 * `wp-block-heading` class (h2 on some pages, h3 on others). That class is content-only,
 * so it never matches nav/footer. We pick whichever level dominates as the question level
 * and pair each with the text up to the next question. The page is trimmed at <footer>
 * first so the last answer doesn't swallow page chrome.
 */
function walkQaByBlockHeading(html) {
  const footAt = html.search(/<footer\b|id=["']colophon|class=["'][^"']*site-footer/i);
  const body = footAt > 0 ? html.slice(0, footAt) : html;
  const re = /<h([23])\b[^>]*class=["'][^"']*wp-block-heading[^"']*["'][^>]*>([\s\S]*?)<\/h\1>/gi;
  const all = [...body.matchAll(re)];
  if (all.length === 0) return [];
  const h3n = all.filter((m) => m[1] === '3').length;
  const qLevel = h3n >= 3 ? '3' : '2';
  const marks = all.filter((m) => m[1] === qLevel);
  const qa = [];
  for (let i = 0; i < marks.length; i++) {
    const q = htmlToText(marks[i][2]).replace(/^\d+[.)]\s*/, '');
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    const a = htmlToText(body.slice(start, end));
    if (q && a.length > 20) qa.push({ q, a });
  }
  return qa;
}

/**
 * Parse one FAQ page. Kapruka uses several markup families across its FAQ pages:
 *   A) a `kp-faq-wrap` block (div OR section) with <h3> questions under <h2> sections
 *      (some pages have no <h2>, or carry questions in <h2> directly);
 *   B) WordPress pages where each question is an <h2>/<h3> with class `wp-block-heading`.
 * Try them in order and return the first that yields Q&A.
 */
function parseFaq(html) {
  const wrap = sliceClass(html, 'kp-faq-wrap');
  if (wrap) {
    const tldr = /class=["'][^"']*kp-tldr[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(wrap);
    const summary = tldr ? htmlToText(tldr[1]) : '';
    const qa = walkQa(wrap, '3', '2'); // h3 = question, h2 = section
    if (qa.length) return { summary, qa };
    const qaH2 = walkQa(wrap, '2', null); // fallback: questions live in h2
    if (qaH2.length) return { summary, qa: qaH2 };
  }
  const wp = walkQaByBlockHeading(html);
  if (wp.length) return { summary: '', qa: wp };
  return null;
}

async function scrapeFaq() {
  const faq = [];
  for (const [category, url] of FAQ_PAGES) {
    try {
      const html = await fetchPage(url);
      const parsed = parseFaq(html);
      if (!parsed || parsed.qa.length === 0) {
        console.warn(`! ${category.padEnd(28)} no Q&A found (page shape may differ) — skipped`);
        continue;
      }
      faq.push({ category, url, summary: parsed.summary, qa: parsed.qa });
      console.log(`✓ ${category.padEnd(28)} ${parsed.qa.length} Q&A`);
    } catch (err) {
      console.warn(`! ${category.padEnd(28)} ${err.message} — skipped`);
    }
  }
  return faq;
}

// ── main ──────────────────────────────────────────────────────────────────────

let policies = {};
try {
  policies = await scrapePolicies();
  console.log(`✓ policies${' '.repeat(20)} ${Object.keys(policies).length} sections`);
} catch (err) {
  console.warn(`! policies: ${err.message} — kept empty`);
}

const faq = await scrapeFaq();

const data = { about: ABOUT, contact: CONTACT, policies, faq };

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2));
const totalQa = faq.reduce((n, f) => n + f.qa.length, 0);
console.log(`→ Written ${OUT}: ${faq.length} FAQ topics (${totalQa} Q&A), ${Object.keys(policies).length} policy sections`);
