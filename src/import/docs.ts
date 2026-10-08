import { TABLES } from '../data/types';
import { COLUMNS, FILE_FORMAT, TABLE_LABELS } from './tables';

export const DOCS_START = '<!-- import-columns:start -->';
export const DOCS_END = '<!-- import-columns:end -->';

/** The README section listing every import file's columns, generated from COLUMNS. */
export function renderImportDocs(): string {
  const parts: string[] = [DOCS_START];
  for (const t of TABLES) {
    const ext = FILE_FORMAT[t];
    parts.push('', `### ${TABLE_LABELS[t]} (\`${t}.${ext}\`)`, '');
    if (ext === 'json') {
      parts.push(`A JSON list of objects, or an object with a \`${t}\` list. Each object has these keys.`, '');
    }
    parts.push('| Column | Required | Meaning |', '| --- | --- | --- |');
    for (const c of COLUMNS[t]) {
      parts.push(`| \`${c.name}\` | ${c.required ? 'yes' : 'no'} | ${c.description.replace(/\|/g, '\\|')} |`);
    }
  }
  parts.push('', DOCS_END);
  return parts.join('\n');
}
