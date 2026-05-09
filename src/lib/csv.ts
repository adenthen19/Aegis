// Decode an uploaded CSV file with encoding detection.
//
// `file.text()` always decodes as UTF-8 (with permissive U+FFFD
// substitution for invalid sequences). Excel on Windows commonly
// produces Windows-1252 / Latin-1 files with no BOM — those decode to
// mojibake under UTF-8, e.g. "Bhd." becomes "Bhd." and "São" becomes
// "S?o". We try strict UTF-8 first and fall back to Windows-1252 only
// when the file isn't valid UTF-8, which preserves most names without
// changing anything for users who already export as UTF-8.
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // Not valid UTF-8 — fall back to Windows-1252. This is a superset
    // of Latin-1 and covers what Excel-on-Windows produces by default.
    // For other encodings (Big5, Shift-JIS, etc.) characters will still
    // be wrong; we accept that as a known limitation since Excel's
    // "CSV UTF-8" save format exists for that case.
    return new TextDecoder('windows-1252').decode(buf);
  }
}

// Tiny CSV parser shared by all import flows. Quoted fields with embedded
// commas, quotes (escaped as ""), and newlines are supported. Strips a UTF-8
// BOM if Excel added one. Returns rows; each row is a string array.
export function parseCsv(text: string): string[][] {
  const cleaned = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\n') {
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
      } else field += ch;
    }
  }
  if (field !== '' || current.length) {
    current.push(field);
    rows.push(current);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type ImportRowError = { row: number; message: string };
export type ImportState = {
  ok: boolean;
  error: string | null;
  imported: number;
  // Rows skipped because of validation errors. Each has a row in `errors`.
  skipped: number;
  // Rows skipped because they match an existing record (different from
  // validation errors — duplicates aren't user mistakes, they're re-imports).
  duplicates: number;
  errors: ImportRowError[];
};

export const IMPORT_INITIAL: ImportState = {
  ok: false,
  error: null,
  imported: 0,
  skipped: 0,
  duplicates: 0,
  errors: [],
};

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCsvTemplate(headers: readonly string[], exampleRow: string[]): string {
  const lines = [
    headers.map(csvEscape).join(','),
    exampleRow.map(csvEscape).join(','),
  ];
  // UTF-8 BOM so Excel auto-detects encoding.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
