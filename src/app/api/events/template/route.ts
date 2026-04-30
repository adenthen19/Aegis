import {
  EVENT_GUEST_IMPORT_HEADERS,
  EVENT_GUEST_IMPORT_EXAMPLE_ROW,
} from '@/lib/event-import';
import { buildCsvTemplate } from '@/lib/csv';

export async function GET() {
  const body = buildCsvTemplate(EVENT_GUEST_IMPORT_HEADERS, EVENT_GUEST_IMPORT_EXAMPLE_ROW);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="event-guests-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
