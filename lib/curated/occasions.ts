import occasionsData from "@/data/occasions.json";

type Section = { name: string; ids: string[] };
type Occasion = { label: string; sections: Section[] };
const OCCASIONS = occasionsData as Record<string, Occasion>;

/** Keyword → section-name fragments, for mapping a user's product-type to a curated section. */
const SUBCATEGORY_SYNONYMS: Record<string, string[]> = {
  perfume: ["fashion and cosmetics"],
  cologne: ["fashion and cosmetics"],
  fragrance: ["fashion and cosmetics"],
  skincare: ["fashion and cosmetics"],
  cosmetics: ["fashion and cosmetics"],
  makeup: ["fashion and cosmetics"],
  beauty: ["fashion and cosmetics"],
  jewellery: ["jewellery and gifts"],
  jewelry: ["jewellery and gifts"],
  watch: ["fashion and cosmetics", "speciality gifts"],
  cake: ["cakes"],
  flower: ["flowers"],
  bouquet: ["flowers"],
  chocolate: ["chocolates best sellers", "chocolates"],
  toy: ["teddies and gifts", "party essentials"],
  teddy: ["teddies and gifts"],
  soft: ["teddies and gifts"],
  book: ["books"],
  electronic: ["electronics"],
  gadget: ["electronics"],
  voucher: ["gift vouchers"],
  card: ["greeting cards"],
  greeting: ["greeting cards"],
  fruit: ["fruit baskets"],
  hamper: ["hampers", "combo gift packs"],
  combo: ["combo gift packs"],
  clothing: ["clothing"],
  saree: ["clothing"],
  dress: ["clothing"],
  grooming: ["fashion and cosmetics"],
  spa: ["fashion and cosmetics", "health care"],
  diaper: ["essential hygiene", "essential general"],
  baby: ["essential general", "essential hygiene"],
};

export function isOccasion(list: string): boolean {
  return Object.prototype.hasOwnProperty.call(OCCASIONS, list);
}

export function listOccasions(): string[] {
  return Object.keys(OCCASIONS);
}

function matchSections(occasion: Occasion, subcategory: string): Section[] {
  const q = subcategory.trim().toLowerCase();
  if (!q) return [];

  // 1. Direct contains match against actual section names (either direction).
  const direct = occasion.sections.filter(
    (s) => s.name.includes(q) || q.includes(s.name),
  );
  if (direct.length) return direct;

  // 2. Synonym map: any query token → known section-name fragments.
  const wanted = new Set<string>();
  for (const token of q.split(/[^a-z]+/).filter(Boolean)) {
    for (const frag of SUBCATEGORY_SYNONYMS[token] ?? []) wanted.add(frag);
  }
  return occasion.sections.filter((s) => [...wanted].some((w) => s.name.includes(w)));
}

/**
 * Resolve curated product IDs for an occasion page.
 * - With `subcategory`: returns IDs from the matching section(s), in curated order.
 * - Without: returns a *variety spread* — round-robins across sections so a broad
 *   "gifts for mom" yields a cake, a perfume, jewellery, flowers… not 12 cakes.
 * Returns `{ ids, matchedSections, allSections }` so callers can guide the model.
 */
export function resolveOccasionIds(
  list: string,
  subcategory: string | undefined,
  limit: number,
): { ids: string[]; matchedSections: string[]; allSections: string[] } {
  const occasion = OCCASIONS[list];
  if (!occasion) return { ids: [], matchedSections: [], allSections: [] };
  const allSections = occasion.sections.map((s) => s.name);

  let pool: Section[];
  if (subcategory) {
    const matched = matchSections(occasion, subcategory);
    // Fall back to a full spread if the requested sub-category isn't curated here.
    pool = matched.length ? matched : occasion.sections;
    if (matched.length) {
      const ids: string[] = [];
      for (const s of matched) for (const id of s.ids) if (ids.length < limit) ids.push(id);
      return { ids, matchedSections: matched.map((s) => s.name), allSections };
    }
  } else {
    pool = occasion.sections;
  }

  // Round-robin across sections for variety.
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let depth = 0; ids.length < limit; depth++) {
    let advanced = false;
    for (const s of pool) {
      if (depth >= s.ids.length) continue;
      advanced = true;
      const id = s.ids[depth];
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
        if (ids.length >= limit) break;
      }
    }
    if (!advanced) break;
  }
  return { ids, matchedSections: [], allSections };
}
