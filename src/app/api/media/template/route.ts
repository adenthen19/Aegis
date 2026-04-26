import {
  MEDIA_IMPORT_HEADERS,
  MEDIA_IMPORT_EXAMPLE_ROW,
} from '@/lib/media-import';
import { buildCsvTemplate } from '@/lib/csv';

export async function GET() {
  const body = buildCsvTemplate(MEDIA_IMPORT_HEADERS, MEDIA_IMPORT_EXAMPLE_ROW);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="media-contacts-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
