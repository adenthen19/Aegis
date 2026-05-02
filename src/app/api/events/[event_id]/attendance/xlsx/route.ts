import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import type { EventGuest, EventGuestCheckin } from '@/lib/types';

type AuditRow = {
  performed_at: string;
  action: 'checkin' | 'undo';
  source: 'kiosk' | 'admin' | 'sheet';
  guest_name: string | null;
  guest_company: string | null;
  performed_by_label: string | null;
};

export const runtime = 'nodejs';

// Aegis brand colours — kept consistent with the PDF report.
const COLORS = {
  navy: 'FF1C5592',
  navyTint: 'FFEAF1F9',
  emerald: 'FF059669',
  emeraldTint: 'FFECFDF5',
  orange: 'FFEE7724',
  orangeTint: 'FFFDF1E7',
  gray100: 'FFF3F4F6',
  gray400: 'FF9CA3AF',
  gray800: 'FF1F2937',
  white: 'FFFFFFFF',
} as const;

function safeFilename(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'event'
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ event_id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { event_id } = await params;

  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select(
      'event_id, name, event_date, location, description, adhoc_client_name, clients ( corporate_name )',
    )
    .eq('event_id', event_id)
    .maybeSingle();
  if (eventErr) return new Response(`Database error: ${eventErr.message}`, { status: 500 });
  if (!event) return new Response('Event not found', { status: 404 });

  const { data: guests, error: guestsErr } = await supabase
    .from('event_guests')
    .select('*')
    .eq('event_id', event_id);
  if (guestsErr) return new Response(`Database error: ${guestsErr.message}`, { status: 500 });

  const { data: auditRaw } = await supabase
    .from('event_guest_checkins')
    .select(
      'performed_at, action, source,'
        + ' event_guests ( full_name, company ),'
        + ' profiles:performed_by_user_id ( display_name, email )',
    )
    .eq('event_id', event_id)
    .order('performed_at', { ascending: true });

  const audit: AuditRow[] = (
    (auditRaw ?? []) as unknown as Array<
      Pick<EventGuestCheckin, 'performed_at' | 'action' | 'source'> & {
        event_guests: { full_name: string; company: string | null } | null;
        profiles: { display_name: string | null; email: string } | null;
      }
    >
  ).map((row) => ({
    performed_at: row.performed_at,
    action: row.action,
    source: row.source,
    guest_name: row.event_guests?.full_name ?? null,
    guest_company: row.event_guests?.company ?? null,
    performed_by_label:
      row.profiles?.display_name?.trim() ||
      row.profiles?.email ||
      null,
  }));

  const rows = (guests ?? []) as EventGuest[];
  const total = rows.length;
  const checkedIn = rows.filter((g) => g.checked_in).length;
  const pending = total - checkedIn;
  const pct = total === 0 ? 0 : checkedIn / total;
  const clientLabel =
    (
      (event as unknown as {
        clients: { corporate_name: string } | null;
      }).clients?.corporate_name
    ) ??
    ((event.adhoc_client_name as string | null) ?? null);

  // ── Build workbook ──────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aegis Communication';
  wb.created = new Date();

  // Sheet 1 — Summary
  const summary = wb.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: COLORS.navy } },
  });
  summary.columns = [
    { width: 26 },
    { width: 60 },
  ];

  // Title block
  const titleRow = summary.addRow(['Event attendance report']);
  titleRow.font = { bold: true, size: 16, color: { argb: COLORS.navy } };
  summary.mergeCells(titleRow.number, 1, titleRow.number, 2);
  titleRow.height = 26;

  summary.addRow([]);
  const eventNameRow = summary.addRow(['Event', event.name as string]);
  eventNameRow.getCell(1).font = { bold: true, color: { argb: COLORS.gray400 } };
  eventNameRow.getCell(2).font = { bold: true, size: 13, color: { argb: COLORS.navy } };

  if (clientLabel) {
    const r = summary.addRow(['Client', clientLabel]);
    r.getCell(1).font = { bold: true, color: { argb: COLORS.gray400 } };
  }
  const dateRow = summary.addRow(['Date & time', fmtDate(event.event_date as string)]);
  dateRow.getCell(1).font = { bold: true, color: { argb: COLORS.gray400 } };
  if (event.location) {
    const r = summary.addRow(['Location', event.location as string]);
    r.getCell(1).font = { bold: true, color: { argb: COLORS.gray400 } };
  }
  if (event.description) {
    const r = summary.addRow(['Description', event.description as string]);
    r.getCell(1).font = { bold: true, color: { argb: COLORS.gray400 } };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    r.height = Math.min(120, 18 + Math.ceil((event.description as string).length / 60) * 14);
  }

  summary.addRow([]);
  const kpiHeader = summary.addRow(['Attendance']);
  kpiHeader.font = { bold: true, color: { argb: COLORS.navy } };
  summary.mergeCells(kpiHeader.number, 1, kpiHeader.number, 2);

  function addKpi(label: string, value: string | number, fillArgb: string, fontArgb: string) {
    const row = summary.addRow([label, value]);
    row.height = 22;
    row.getCell(1).font = { bold: true, size: 11, color: { argb: fontArgb } };
    row.getCell(2).font = { bold: true, size: 14, color: { argb: fontArgb } };
    row.getCell(2).alignment = { horizontal: 'right' };
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    });
  }
  addKpi('Total guests', total, COLORS.navyTint, COLORS.navy);
  addKpi('Checked in', checkedIn, COLORS.emeraldTint, COLORS.emerald);
  addKpi('Pending', pending, COLORS.gray100, COLORS.gray800);
  const pctRow = summary.addRow(['Attendance rate', pct]);
  pctRow.height = 22;
  pctRow.getCell(1).font = { bold: true, size: 11, color: { argb: COLORS.orange } };
  pctRow.getCell(2).font = { bold: true, size: 14, color: { argb: COLORS.orange } };
  pctRow.getCell(2).numFmt = '0%';
  pctRow.getCell(2).alignment = { horizontal: 'right' };
  pctRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.orangeTint } };
  });

  summary.addRow([]);
  // By-company breakdown
  const companyHeader = summary.addRow(['Company', 'Invited', 'Checked in', 'Attendance']);
  companyHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: COLORS.gray400 } } };
  });
  // Adjust company sheet columns once we know we need 4
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 14;
  summary.getColumn(3).width = 14;
  summary.getColumn(4).width = 14;

  const companyMap = new Map<string, { total: number; checkedIn: number }>();
  for (const g of rows) {
    const key = (g.company?.trim() || 'Independent / unknown').slice(0, 80);
    const slot = companyMap.get(key) ?? { total: 0, checkedIn: 0 };
    slot.total += 1;
    if (g.checked_in) slot.checkedIn += 1;
    companyMap.set(key, slot);
  }
  const byCompany = Array.from(companyMap.entries())
    .map(([company, s]) => ({ company, ...s }))
    .sort((a, b) => b.total - a.total);

  for (const c of byCompany) {
    const cPct = c.total === 0 ? 0 : c.checkedIn / c.total;
    const r = summary.addRow([c.company, c.total, c.checkedIn, cPct]);
    r.getCell(2).alignment = { horizontal: 'right' };
    r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(3).font = { color: { argb: COLORS.emerald }, bold: true };
    r.getCell(4).numFmt = '0%';
    r.getCell(4).alignment = { horizontal: 'right' };
  }

  summary.addRow([]);
  summary.addRow([
    `Generated ${new Date().toLocaleString('en-GB')} for ${user.email ?? 'Aegis'} · Confidential`,
  ]);
  const meta = summary.lastRow!;
  meta.font = { italic: true, color: { argb: COLORS.gray400 }, size: 9 };
  summary.mergeCells(meta.number, 1, meta.number, 4);

  // Sheet 2 — Guest List
  const sheet = wb.addWorksheet('Guest List', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Name', key: 'full_name', width: 28 },
    { header: 'Title', key: 'title', width: 22 },
    { header: 'Company', key: 'company', width: 28 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Contact number', key: 'contact_number', width: 18 },
    { header: 'Table', key: 'table_number', width: 8 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Checked in at', key: 'checked_in_at', width: 18 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  // Header styling
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
  sheet.getRow(1).height = 22;

  // Sort: checked in first (by time), then pending alpha — same ordering as the PDF.
  const sorted = [...rows].sort((a, b) => {
    if (a.checked_in !== b.checked_in) return a.checked_in ? -1 : 1;
    if (a.checked_in && b.checked_in) {
      return (a.checked_in_at ?? '').localeCompare(b.checked_in_at ?? '');
    }
    return a.full_name.localeCompare(b.full_name);
  });

  for (const g of sorted) {
    const row = sheet.addRow({
      full_name: g.full_name,
      title: g.title ?? '',
      company: g.company ?? '',
      email: g.email ?? '',
      contact_number: g.contact_number ?? '',
      table_number: g.table_number ?? '',
      status: g.checked_in ? 'Checked in' : 'Pending',
      checked_in_at: g.checked_in_at
        ? new Date(g.checked_in_at).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : '',
      notes: g.notes ?? '',
    });
    row.getCell('full_name').font = { bold: true, color: { argb: COLORS.navy } };
    if (g.checked_in) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.emeraldTint },
        };
      });
      row.getCell('status').font = {
        bold: true,
        color: { argb: COLORS.emerald },
      };
    } else {
      row.getCell('status').font = { color: { argb: COLORS.gray400 } };
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  // Sheet 3 — Activity Log (only added when there's something to show, so a
  // brand-new event doesn't ship with an empty audit sheet).
  if (audit.length > 0) {
    const log = wb.addWorksheet('Activity Log', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    log.columns = [
      { header: 'Time', key: 'time', width: 22 },
      { header: 'Guest', key: 'guest', width: 28 },
      { header: 'Company', key: 'company', width: 26 },
      { header: 'Action', key: 'action', width: 14 },
      { header: 'By', key: 'by', width: 24 },
      { header: 'Source', key: 'source', width: 12 },
    ];
    log.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });
    log.getRow(1).height = 22;

    for (const row of audit) {
      const r = log.addRow({
        time: new Date(row.performed_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        guest: row.guest_name ?? '—',
        company: row.guest_company ?? '',
        action: row.action === 'checkin' ? 'Checked in' : 'Undo',
        by: row.performed_by_label ?? '—',
        source:
          row.source === 'kiosk'
            ? 'Kiosk'
            : row.source === 'sheet'
              ? 'Sheet'
              : 'Admin',
      });
      r.getCell('guest').font = { bold: true, color: { argb: COLORS.navy } };
      if (row.action === 'checkin') {
        r.getCell('action').font = { bold: true, color: { argb: COLORS.emerald } };
      } else {
        r.getCell('action').font = { color: { argb: COLORS.gray400 } };
      }
      r.getCell('source').font = {
        color: {
          argb:
            row.source === 'kiosk'
              ? COLORS.orange
              : row.source === 'sheet'
                ? COLORS.emerald
                : COLORS.navy,
        },
        bold: true,
      };
    }
    log.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: log.columns.length },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = new Date(event.event_date as string).toISOString().slice(0, 10);
  const filename = `attendance-${safeFilename(event.name as string)}-${stamp}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
