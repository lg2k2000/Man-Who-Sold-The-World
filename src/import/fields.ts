// Field parsers shared by the import validators. Each returns the parsed value
// or throws a FieldError whose message is shown to the owner as the reason a
// row was rejected.

import { REGION_CODES } from './regions';
import { ROLES, ROLE_LABELS, type Role } from '../data/types';

export class FieldError extends Error {}

export function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  // Spreadsheet date cells arrive as dates; they read as YYYY-MM-DD everywhere else.
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function required(v: unknown, what = 'a value'): string {
  const s = text(v);
  if (!s) throw new FieldError(`is empty; it needs ${what}`);
  return s;
}

export function optional(v: unknown): string | null {
  const s = text(v);
  return s ? s : null;
}

/** Splits a multi-value cell on semicolons (commas also work when no semicolon is present). Lists pass through. */
export function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(text).filter(Boolean);
  const s = text(v);
  if (!s) return [];
  const sep = s.includes(';') ? ';' : ',';
  return s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(v: unknown): string {
  const s = required(v, 'an email address').toLowerCase();
  if (!EMAIL.test(s)) throw new FieldError(`"${s}" is not an email address`);
  return s;
}

export function optionalEmail(v: unknown): string | null {
  const s = text(v);
  return s ? email(s) : null;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

/** Ids the owner assigns: lowercase letters, digits, and hyphens, such as sample-co-1. */
export function id(v: unknown, what = 'an id'): string {
  const s = required(v, what).toLowerCase();
  if (!ID.test(s)) throw new FieldError(`"${s}" is not a valid id; use lowercase letters, digits, and hyphens`);
  return s;
}

export function optionalId(v: unknown): string | null {
  const s = text(v);
  return s ? id(s) : null;
}

/** Accepts US-WA, WA, or Washington; CA-BC, BC, or British Columbia. */
export function region(v: unknown): string {
  const raw = required(v, 'a state or province');
  const s = raw.toUpperCase().replace(/\s+/g, '');
  const code = s.includes('-') ? s : (REGION_CODES.byPostal.get(s) ?? REGION_CODES.byName.get(raw.toLowerCase().replace(/\s+/g, ' ')));
  if (!code || !REGION_CODES.all.has(code)) throw new FieldError(`"${raw}" is not a US state or Canadian province`);
  return code;
}

export function optionalRegion(v: unknown): string | null {
  return text(v) ? region(v) : null;
}

export function regions(v: unknown): string[] {
  return [...new Set(list(v).map(region))];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function ymd(y: number, m: number, d: number, original: string): string {
  if (y < 100) y += 2000;
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const check = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== s) throw new FieldError(`"${original}" is not a real date`);
  return s;
}

/**
 * A date that exists on the calendar, returned as YYYY-MM-DD. Accepts
 * YYYY-MM-DD, US month/day/year (10/15/2026 or 10/15/26), 15-Oct-2026,
 * Oct 15, 2026, spreadsheet date cells, and Excel date serial numbers.
 */
export function date(v: unknown, what = 'a date'): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new FieldError('is not a real date');
    return v.toISOString().slice(0, 10);
  }
  const s = required(v, what);
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/))) return ymd(+m[1]!, +m[2]!, +m[3]!, s);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) return ymd(+m[3]!, +m[1]!, +m[2]!, s);
  if ((m = s.match(/^(\d{1,2})[-\s]([a-z]{3})[a-z]*\.?[-\s,]+(\d{2}|\d{4})$/i))) {
    const month = MONTHS.indexOf(m[2]!.toLowerCase());
    if (month >= 0) return ymd(+m[3]!, month + 1, +m[1]!, s);
  }
  if ((m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i))) {
    const month = MONTHS.indexOf(m[1]!.toLowerCase());
    if (month >= 0) return ymd(+m[3]!, month + 1, +m[2]!, s);
  }
  // Excel stores dates as days since 1899-12-30; 20000 to 80000 covers 1954 to 2119.
  if (/^\d{5}(\.\d+)?$/.test(s) && +s >= 20000 && +s <= 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000).toISOString().slice(0, 10);
  }
  throw new FieldError(`"${s}" is not a date; use YYYY-MM-DD or month/day/year`);
}

export function optionalDate(v: unknown): string | null {
  const s = text(v);
  return s ? date(s) : null;
}

export function number(v: unknown, min: number, max: number, what: string): number | null {
  const s = text(v);
  if (!s) return null;
  const n = typeof v === 'number' ? v : Number(s);
  if (!Number.isFinite(n)) throw new FieldError(`"${s}" is not a number`);
  if (n < min || n > max) throw new FieldError(`${n} is outside ${min} to ${max} for ${what}`);
  return n;
}

export function oneOf<T extends string>(v: unknown, options: readonly T[], fallback?: T, aliases: Record<string, T> = {}): T {
  const s = text(v).toLowerCase();
  if (!s) {
    if (fallback !== undefined) return fallback;
    throw new FieldError(`is empty; it needs one of ${options.join(', ')}`);
  }
  if ((options as readonly string[]).includes(s)) return s as T;
  if (aliases[s]) return aliases[s]!;
  throw new FieldError(`"${text(v)}" is not one of ${options.join(', ')}`);
}

const ROLE_ALIASES: Record<string, Role> = {};
for (const r of ROLES) {
  ROLE_ALIASES[r] = r;
  ROLE_ALIASES[ROLE_LABELS[r].toLowerCase()] = r;
}
Object.assign(ROLE_ALIASES, {
  'executive account manager': 'eam',
  morpheus: 'morpheus',
  opsramp: 'opsramp',
  'aruba specialist': 'networking',
  'juniper specialist': 'networking',
  'sled specialist': 'sled',
  'sled overlay specialist': 'sled',
  'state, local, and education overlay': 'sled',
});

export function roles(v: unknown): Role[] {
  const items = list(v);
  if (!items.length) throw new FieldError('is empty; it needs at least one role');
  const out: Role[] = [];
  for (const item of items) {
    const r = ROLE_ALIASES[item.toLowerCase()];
    if (!r) throw new FieldError(`"${item}" is not a known role; use ${ROLES.join(', ')}`);
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

export const OP_ID = /^OPE-\d{10}$/;

/** OPE- followed by exactly ten digits. */
export function opId(v: unknown): string {
  const s = required(v, 'an op ID').toUpperCase().replace(/\s+/g, '');
  if (!OP_ID.test(s)) throw new FieldError(`"${text(v)}" is not OPE- followed by ten digits`);
  return s;
}

export function optionalOpId(v: unknown): string | null {
  return text(v) ? opId(v) : null;
}

/**
 * A dollar amount: 1250000, "$1,250,000.00", "1.25M", or "450K". Empty is
 * null. Negative amounts are refused.
 */
export function amount(v: unknown): number | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new FieldError('is not a number');
    if (v < 0) throw new FieldError(`${v} is negative`);
    return Math.round(v * 100) / 100;
  }
  const s = text(v);
  if (!s) return null;
  const m = s
    .replace(/^(usd|us\$|\$)\s*/i, '')
    .replace(/\s*(usd)$/i, '')
    .replace(/[$,\s]/g, '')
    .match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) throw new FieldError(`"${s}" is not a dollar amount`);
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  return Math.round(+m[1]! * scale * 100) / 100;
}

export function url(v: unknown): string {
  const s = required(v, 'a URL');
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    throw new FieldError(`"${s}" is not an http or https URL`);
  }
  return s;
}
