import { NextResponse } from 'next/server';
import { syncEventSheetAction } from '@/app/(app)/events/sheets-actions';

export const runtime = 'nodejs';

// POST /api/events/[event_id]/sheets/sync
//
// Lightweight endpoint the kiosk hits every ~15 seconds. Just delegates to
// the server action so the same auth / RLS / Google connection plumbing
// applies. Returns a small JSON body so the caller can flash a "X synced
// from sheet" indicator on success.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ event_id: string }> },
) {
  const { event_id } = await params;
  const result = await syncEventSheetAction(event_id);
  if (!result.ok) {
    return NextResponse.json(result, { status: 200 });
  }
  return NextResponse.json(result);
}
