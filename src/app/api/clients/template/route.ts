import { CLIENT_IMPORT_HEADERS, CLIENT_IMPORT_EXAMPLE_ROW } from '@/lib/client-import';

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  const lines = [
    CLIENT_IMPORT_HEADERS.map(csvEscape).join(','),
    CLIENT_IMPORT_EXAMPLE_ROW.map(csvEscape).join(','),
  ];
  // UTF-8 BOM so Excel auto-detects encoding
  const body = '﻿' + lines.join('\r\n') + '\r\n';

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="clients-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
