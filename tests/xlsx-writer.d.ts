declare module '*/xlsx-writer.mjs' {
  export function writeXlsx(sheets: { name: string; rows: unknown[][] }[]): Uint8Array;
}
