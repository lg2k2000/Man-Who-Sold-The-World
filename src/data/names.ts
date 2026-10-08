// Name handling shared by imports, search, and the edit forms: matching a
// company or person by name, and making ids from names.

/** Lowercase with accents removed. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const COMPANY_ENDINGS = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'lp',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'plc',
  'pllc',
  'pc',
  'ulc',
])

/**
 * The form two company names share when they name the same company: case,
 * accents, punctuation, a leading "The", and endings such as Inc, LLC, Corp,
 * and Company are ignored, and "&" reads as "and". "Acme Corp." and "ACME
 * Corporation" match; "Acme Health" and "Acme" do not.
 */
export function companyMatchKey(name: string): string {
  const words = fold(name)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words[0] === 'the' && words.length > 1) words.shift();
  while (words.length > 1 && COMPANY_ENDINGS.has(words[words.length - 1]!)) words.pop();
  return words.join(' ');
}

/** The form two people's names share: case, accents, punctuation, and extra spaces ignored. */
export function personMatchKey(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Acme Corp., Seattle" becomes acme-corp-seattle. Empty input becomes "item". */
export function slugify(s: string, max = 48): string {
  const slug = fold(s)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'item';
}

/** `base`, or base-2, base-3, and so on, whichever is not taken yet. */
export function uniqueId(base: string, taken: (id: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!taken(id)) return id;
  }
}
