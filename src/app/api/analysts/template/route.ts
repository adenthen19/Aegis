import {
  ANALYST_IMPORT_HEADERS,
  ANALYST_IMPORT_EXAMPLE_ROW,
} from '@/lib/analyst-import';
import { buildCsvTemplate } from '@/lib/csv';

export async function GET() {
  const body = buildCsvTemplate(ANALYST_IMPORT_HEADERS, ANALYST_IMPORT_EXAMPLE_ROW);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="analysts-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
