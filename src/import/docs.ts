import { TABLES } from '../data/types';
import { COLUMNS, JSON_ONLY, TABLE_LABELS } from './tables';

export const DOCS_START = '<!-- import-columns:start -->';
export const DOCS_END = '<!-- import-columns:end -->';

/** The README section listing every import's columns, generated from COLUMNS. */
export function renderImportDocs(): string {
  const parts: string[] = [DOCS_START];
  for (const t of TABLES) {
    parts.push('', `### ${TABLE_LABELS[t]}`, '');
    parts.push(
      JSON_ONLY.has(t)
        ? `A JSON list of objects, or an object with a \`${t}\` list. Each object has these keys.`
        : `An Excel workbook, a CSV file, rows pasted from a spreadsheet, or a JSON list. The column names below match automatically, and so do the other names listed with each; any other column can be matched by hand.`,
      '',
    );
    parts.push('| Column | Required | Meaning | Also matches |', '| --- | --- | --- | --- |');
    for (const c of COLUMNS[t]) {
      const also = (c.aliases ?? []).map((a) => a.replace(/\|/g, '\\|')).join(', ');
      parts.push(`| \`${c.name}\` | ${c.required ? 'yes' : 'no'} | ${c.description.replace(/\|/g, '\\|')} | ${also} |`);
    }
  }
  parts.push('', DOCS_END);
  return parts.join('\n');
}
