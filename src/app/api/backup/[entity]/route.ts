import { assertSuperAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { findBackupEntity, rowsToCsv } from '@/lib/backup';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const guard = await assertSuperAdmin();
  if (!guard.ok) {
    return new Response(guard.error, { status: 403 });
  }

  const { entity } = await params;
  const cfg = findBackupEntity(entity);
  if (!cfg) {
    return new Response(`Unknown entity: ${entity}`, { status: 404 });
  }

  const supabase = await createClient();
  // Pull every row. This is intentionally unpaged — backups should be
  // complete by definition. For very large tables (>50k rows) we'd switch
  // to streamed CSV, but for an internal IR/PR firm's dataset this is
  // overwhelmingly fine.
  const { data, error } = await supabase
    .from(cfg.table)
    .select(cfg.columns.join(', '));
  if (error) {
    return new Response(`Database error: ${error.message}`, { status: 500 });
  }

  const csv = rowsToCsv(
    cfg.columns,
    (data ?? []) as unknown as Array<Record<string, unknown>>,
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${cfg.filename}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
