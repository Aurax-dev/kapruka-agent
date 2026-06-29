import infoData from "@/data/kapruka-info.json";

// Static knowledge base scraped by scripts/scrape-kapruka-info.mjs — company info,
// contact details, return/refund policies, and topic FAQs. Consulted on demand by the
// `get_kapruka_info` tool; it is NOT part of the product search/purchase path.

type Office = { country: string; address: string; phone: string };
type About = { summary: string; mission: string; vision: string; services: string[] };
type Contact = { email: string; hotline: string; whatsapp: string; offices: Office[] };
type PolicySection = { title: string; text: string };
type FaqQa = { section?: string; q: string; a: string };
type FaqTopic = { category: string; url: string; summary: string; qa: FaqQa[] };
type InfoData = {
  about: About;
  contact: Contact;
  policies: Record<string, PolicySection>;
  faq: FaqTopic[];
};

const INFO = infoData as InfoData;

export type InfoTopic = "about" | "contact" | "policies" | "faq";

// FAQ is 300+ Q&A — never hand the model the whole thing. A keyword query returns the
// best-matching handful; an empty query returns the category menu so it can narrow down.
const MAX_FAQ_RESULTS = 8;

const tokenize = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z0-9]+/i).filter((t) => t.length >= 3);

const overlapScore = (haystack: string, queryTokens: string[]): number => {
  const hay = haystack.toLowerCase();
  return queryTokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
};

function faqLookup(query?: string): unknown {
  const categories = INFO.faq.map((f) => f.category);
  const q = query?.trim();
  if (!q) {
    // No keyword — return the menu so the model can pick a category to ask about.
    return { categories: INFO.faq.map((f) => ({ category: f.category, summary: f.summary })) };
  }

  const qTokens = tokenize(q);
  const scored = INFO.faq.flatMap((topic) =>
    topic.qa.map((item) => {
      // Weight question + category/section matches above answer-body matches.
      const score =
        overlapScore(item.q, qTokens) * 3 +
        overlapScore(`${topic.category} ${item.section ?? ""}`, qTokens) * 2 +
        overlapScore(item.a, qTokens);
      return { category: topic.category, section: item.section, q: item.q, a: item.a, score };
    }),
  );

  const results = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FAQ_RESULTS)
    .map(({ score: _score, ...rest }) => rest);

  if (results.length === 0) {
    return { results: [], note: `No FAQ entry matched "${q}".`, categories };
  }
  return { results };
}

/**
 * Resolve Kapruka knowledge for the `get_kapruka_info` tool.
 * - `about`    → company overview + contact details.
 * - `contact`  → contact details / offices only.
 * - `policies` → all return/refund/cancellation policy sections (one screenful).
 * - `faq`      → best-matching Q&A for `query`, or the category menu if no query.
 */
export function lookupKaprukaInfo(topic: string, query?: string): unknown {
  switch (topic) {
    case "about":
      return { about: INFO.about, contact: INFO.contact };
    case "contact":
      return { contact: INFO.contact };
    case "policies":
      return { policies: Object.values(INFO.policies) };
    case "faq":
      return faqLookup(query);
    default:
      return {
        error: `Unknown topic "${topic}". Valid topics: about, contact, policies, faq.`,
        faq_categories: INFO.faq.map((f) => f.category),
      };
  }
}
