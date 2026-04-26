import { CLIENT_IMPORT_HEADERS, CLIENT_IMPORT_EXAMPLE_ROW } from '@/lib/client-import';
import { buildCsvTemplate } from '@/lib/csv';

export async function GET() {
  const body = buildCsvTemplate(CLIENT_IMPORT_HEADERS, CLIENT_IMPORT_EXAMPLE_ROW);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="clients-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
