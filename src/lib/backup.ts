// Backup catalog. Each entry is one entity that the super_admin can export
// as CSV. Adding a new export = adding an entry here; the route handler picks
// it up automatically.

export type BackupEntity = {
  // URL slug, e.g. /api/backup/clients
  slug: string;
  // Display name on the admin page.
  label: string;
  // One-line description.
  description: string;
  // Supabase table name.
  table: string;
  // Columns to export, in order. Keep these explicit so the CSV is stable
  // even when we add new columns to a table.
  columns: string[];
  // Filename prefix (date is appended automatically).
  filename: string;
};

export const BACKUP_ENTITIES: BackupEntity[] = [
  {
    slug: 'clients',
    label: 'Clients',
    description: 'Corporate clients with company profile and service tiers.',
    table: 'clients',
    columns: [
      'client_id',
      'corporate_name',
      'ticker_code',
      'industry',
      'market_segment',
      'financial_year_end',
      'financial_quarter',
      'service_tier',
      'ipo_status',
      'internal_controls_audit',
      'logo_url',
      'created_at',
      'updated_at',
    ],
    filename: 'clients',
  },
  {
    slug: 'engagements',
    label: 'Engagements',
    description: 'Per-client contracted scopes of work.',
    table: 'engagements',
    columns: [
      'engagement_id',
      'client_id',
      'name',
      'engagement_type',
      'status',
      'start_date',
      'end_date',
      'service_tier',
      'contract_value',
      'currency',
      'billing_terms',
      'scope_summary',
      'notes',
      'created_at',
      'updated_at',
    ],
    filename: 'engagements',
  },
  {
    slug: 'stakeholders',
    label: 'Client stakeholders',
    description: 'CEO/CFO, board, advisors, IR/PR contacts on the client side.',
    table: 'client_stakeholders',
    columns: [
      'stakeholder_id',
      'client_id',
      'category',
      'role',
      'full_name',
      'email',
      'phone',
      'is_primary',
      'notes',
      'created_at',
    ],
    filename: 'stakeholders',
  },
  {
    slug: 'commitments',
    label: 'Commitments',
    description: 'Per-engagement deliverables we committed to.',
    table: 'client_deliverables',
    columns: [
      'client_deliverable_id',
      'client_id',
      'engagement_id',
      'service_tier',
      'kind',
      'label',
      'status',
      'target_count',
      'completed_count',
      'due_date',
      'auto_generated_key',
      'notes',
      'created_at',
      'updated_at',
    ],
    filename: 'commitments',
  },
  {
    slug: 'sessions',
    label: 'Sessions',
    description: 'Scheduled briefings / meetings under a commitment.',
    table: 'deliverable_schedule',
    columns: [
      'schedule_id',
      'engagement_id',
      'client_deliverable_id',
      'meeting_id',
      'scheduled_at',
      'location',
      'status',
      'notes',
      'created_at',
      'updated_at',
    ],
    filename: 'sessions',
  },
  {
    slug: 'analysts',
    label: 'Analysts',
    description: 'Buy-side and sell-side coverage contacts.',
    table: 'analysts',
    columns: [
      'investor_id',
      'institution_name',
      'full_name',
      'analyst_type',
      'email',
      'contact_number',
      'sentiment_score',
      'created_at',
      'updated_at',
    ],
    filename: 'analysts',
  },
  {
    slug: 'media',
    label: 'Media contacts',
    description: 'Journalists and media stakeholders.',
    table: 'media_contacts',
    columns: [
      'media_id',
      'full_name',
      'company_name',
      'state',
      'email',
      'contact_number',
      'created_at',
      'updated_at',
    ],
    filename: 'media-contacts',
  },
  {
    slug: 'meetings',
    label: 'Meetings',
    description: 'Internal and briefing meetings with summaries.',
    table: 'meetings',
    columns: [
      'meeting_id',
      'meeting_type',
      'meeting_format',
      'meeting_date',
      'client_id',
      'investor_id',
      'location',
      'agenda_items',
      'summary',
      'other_remarks',
      'created_at',
      'updated_at',
    ],
    filename: 'meetings',
  },
  {
    slug: 'press-releases',
    label: 'Press releases',
    description: 'Drafts and distributed releases.',
    table: 'press_releases',
    columns: [
      'press_release_id',
      'client_id',
      'engagement_id',
      'client_deliverable_id',
      'title',
      'release_type',
      'status',
      'release_date',
      'distributed_at',
      'distribution_media_ids',
      'distribution_notes',
      'body',
      'notes',
      'created_at',
      'updated_at',
    ],
    filename: 'press-releases',
  },
  {
    slug: 'coverage',
    label: 'Media coverage',
    description: 'Coverage clippings and metrics linked to press releases.',
    table: 'media_coverage',
    columns: [
      'coverage_id',
      'client_id',
      'press_release_id',
      'media_id',
      'publication_name',
      'reporter_name',
      'coverage_type',
      'publication_date',
      'headline',
      'url',
      'reach_estimate',
      'sentiment',
      'tone_tags',
      'ave_value',
      'prv_value',
      'currency',
      'notes',
      'created_at',
      'updated_at',
    ],
    filename: 'coverage',
  },
  {
    slug: 'pr-value-reports',
    label: 'PR value reports',
    description: 'Generated coverage summaries for client periods.',
    table: 'pr_value_reports',
    columns: [
      'report_id',
      'client_id',
      'engagement_id',
      'title',
      'period_start',
      'period_end',
      'total_coverage_count',
      'total_reach',
      'total_ave',
      'total_prv',
      'currency',
      'notes',
      'sent_to_client_at',
      'sent_to_email',
      'created_at',
    ],
    filename: 'pr-value-reports',
  },
  {
    slug: 'todos',
    label: 'To-dos',
    description: 'All action items across the workspace.',
    table: 'action_items',
    columns: [
      'action_item_id',
      'client_id',
      'client_deliverable_id',
      'meeting_id',
      'pic_user_id',
      'item',
      'status',
      'due_date',
      'completed_at',
      'auto_generated_key',
      'created_at',
      'updated_at',
    ],
    filename: 'todos',
  },
  {
    slug: 'documents',
    label: 'Documents (metadata)',
    description:
      'Document index. Files themselves live in Supabase Storage and need a separate backup.',
    table: 'documents',
    columns: [
      'document_id',
      'client_id',
      'engagement_id',
      'client_deliverable_id',
      'schedule_id',
      'meeting_id',
      'press_release_id',
      'coverage_id',
      'name',
      'category',
      'mime_type',
      'size_bytes',
      'file_path',
      'external_url',
      'description',
      'version',
      'created_at',
    ],
    filename: 'documents',
  },
];

export function findBackupEntity(slug: string): BackupEntity | null {
  return BACKUP_ENTITIES.find((e) => e.slug === slug) ?? null;
}

function csvEscape(value: unknown): string {
  if (value == null) return '';
  let s: string;
  if (Array.isArray(value)) {
    s = value.map((v) => String(v)).join(';');
  } else if (typeof value === 'object') {
    s = JSON.stringify(value);
  } else {
    s = String(value);
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [columns.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => csvEscape(row[col])).join(','));
  }
  // UTF-8 BOM so Excel auto-detects encoding for non-ASCII names.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
