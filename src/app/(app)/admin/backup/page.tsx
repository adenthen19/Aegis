import { requireSuperAdmin } from '@/lib/auth';
import PageHeader from '@/components/page-header';
import { BACKUP_ENTITIES } from '@/lib/backup';

export default async function AdminBackupPage() {
  await requireSuperAdmin();

  return (
    <div>
      <PageHeader
        title="Backup & Export"
        description="Download a CSV snapshot of any table. Files live in Supabase Storage and need a separate Supabase-side backup."
      />

      <div className="rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-4 py-3 mb-6 text-xs text-aegis-orange-600">
        <p className="font-medium">A few things to note:</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>
            Each download is the entire current state of that table. CSVs use
            UTF-8 with a BOM so Excel renders non-ASCII names correctly.
          </li>
          <li>
            Document files (uploaded PDFs, clippings, logos) are NOT in these
            CSVs — only their metadata. Use Supabase Dashboard → Storage to
            export the bucket contents.
          </li>
          <li>
            Treat the resulting files as confidential. They contain client
            contact information.
          </li>
        </ul>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BACKUP_ENTITIES.map((e) => (
          <li
            key={e.slug}
            className="flex items-start justify-between gap-4 rounded-lg border border-aegis-gray-100 bg-white px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-aegis-navy">{e.label}</p>
              <p className="mt-0.5 text-[12px] text-aegis-gray-500">
                {e.description}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-aegis-gray-300">
                {e.columns.length} columns
              </p>
            </div>
            <a
              href={`/api/backup/${e.slug}`}
              download
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-navy-50"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 4v12M6 12l6 6 6-6M4 20h16" />
              </svg>
              Download CSV
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
