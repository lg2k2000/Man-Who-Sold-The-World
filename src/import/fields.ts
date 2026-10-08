// Field parsers shared by the import validators. Each returns the parsed value
// or throws a FieldError whose message is shown to the owner as the reason a
// row was rejected.

import { REGION_CODES } from './regions';
import { ROLES, ROLE_LABELS, type Role } from '../data/types';

export class FieldError extends Error {}

export function text(v: unknown): string {
  if (v === null || v === undefined) return '';
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

/** Accepts US-WA or WA, CA-BC or BC. */
export function region(v: unknown): string {
  const s = required(v, 'a state or province code').toUpperCase().replace(/\s+/g, '');
  const code = s.includes('-') ? s : REGION_CODES.byPostal.get(s);
  if (!code || !REGION_CODES.all.has(code)) throw new FieldError(`"${text(v)}" is not a US state or Canadian province code`);
  return code;
}

export function regions(v: unknown): string[] {
  return [...new Set(list(v).map(region))];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD date that exists on the calendar. */
export function date(v: unknown, what = 'a date'): string {
  const s = required(v, `${what} as YYYY-MM-DD`);
  if (!DATE.test(s)) throw new FieldError(`"${s}" is not a date in YYYY-MM-DD form`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new FieldError(`"${s}" is not a real date`);
  return s;
}

export function optionalDate(v: unknown): string | null {
  const s = text(v);
  return s ? date(s) : null;
}

export function number(v: unknown, min: number, max: number, what: string): number | null {
  const s = text(v);
  if (!s) return null;
  const n = Number(s);
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

const OP_ID = /^OPE-\d{10}$/;

/** OPE- followed by exactly ten digits. */
export function opId(v: unknown): string {
  const s = required(v, 'an op_id').toUpperCase();
  if (!OP_ID.test(s)) throw new FieldError(`"${text(v)}" is not OPE- followed by ten digits`);
  return s;
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
