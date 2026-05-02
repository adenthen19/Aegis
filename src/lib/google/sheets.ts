// Aegis ↔ Google Sheets — minimal direct-fetch client.
//
// We only need three operations: get sheet metadata, clear a range, and write
// values. Hand-rolled against `sheets.googleapis.com` so we don't pull in the
// full `googleapis` SDK.

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// Accepts either a bare spreadsheet id or a full URL like
//   https://docs.google.com/spreadsheets/d/<id>/edit#gid=...
// and returns the id, or null if neither matches.
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // URL form
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  // Bare-id form (Google sheet ids are 30-50 chars, alphanumeric + - _)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Low-level fetch wrapper — surfaces Google's error bodies as a nice string
// so the client UI can show "permission denied" instead of "500 internal".
// ─────────────────────────────────────────────────────────────────────────

async function googleFetch(
  url: string,
  init: RequestInit & { accessToken: string },
): Promise<Response> {
  const { accessToken, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(rest.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as {
        error?: { message?: string; status?: string };
      };
      if (body.error?.message) {
        detail = `${body.error.status ?? res.status}: ${body.error.message}`;
      }
    } catch {
      /* non-json error — keep the status text */
    }
    throw new Error(`Google Sheets API: ${detail}`);
  }
  return res;
}

// ─────────────────────────────────────────────────────────────────────────
// Sheet metadata — used to confirm the user can edit the sheet and pick
// (or auto-create) a tab to write to.
// ─────────────────────────────────────────────────────────────────────────

export type SheetMeta = {
  spreadsheetId: string;
  title: string;
  tabs: { sheetId: number; title: string }[];
};

export async function getSpreadsheetMeta(
  spreadsheetId: string,
  accessToken: string,
): Promise<SheetMeta> {
  const res = await googleFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties.sheetId,sheets.properties.title`,
    { accessToken },
  );
  const body = (await res.json()) as {
    spreadsheetId: string;
    properties: { title: string };
    sheets: { properties: { sheetId: number; title: string } }[];
  };
  return {
    spreadsheetId: body.spreadsheetId,
    title: body.properties.title,
    tabs: body.sheets.map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Tab management — make sure the target tab exists, creating if missing.
// ─────────────────────────────────────────────────────────────────────────

export async function ensureTab(
  spreadsheetId: string,
  tabTitle: string,
  accessToken: string,
): Promise<void> {
  const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
  if (meta.tabs.some((t) => t.title === tabTitle)) return;
  await googleFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      accessToken,
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: { title: tabTitle },
            },
          },
        ],
      }),
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Write — clears an A1 range, then dumps `rows` into the top-left cell.
// We use USER_ENTERED so plain strings like "2026-05-12" become real dates,
// numbers stay numeric, and "=A1+B1" formulas work — same forgiveness a
// human paster would get.
// ─────────────────────────────────────────────────────────────────────────

export async function writeRangeReplacing(
  spreadsheetId: string,
  range: string, // e.g. "Attendance!A1"
  values: (string | number | boolean | null)[][],
  accessToken: string,
): Promise<void> {
  // Step 1: blank out the existing tab's used range so stale rows from a
  // previous push don't bleed below the new data.
  const tabName = range.includes('!') ? range.split('!')[0] : range;
  const stripped = tabName.replace(/^['"]|['"]$/g, '');
  await googleFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(stripped)}:clear`,
    { accessToken, method: 'POST' },
  );

  // Step 2: write the new values starting at A1 of the named tab.
  const writeRange = range.includes('!') ? range : `${range}!A1`;
  await googleFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`,
    {
      accessToken,
      method: 'PUT',
      body: JSON.stringify({ values }),
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Format the header row (bold, navy fill, white text) + freeze it. Cosmetic
// but it's what makes a freshly-pushed sheet feel "designed" instead of
// "raw dump".
// ─────────────────────────────────────────────────────────────────────────

export async function styleHeaderRow(
  spreadsheetId: string,
  tabTitle: string,
  numCols: number,
  accessToken: string,
): Promise<void> {
  const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
  const tab = meta.tabs.find((t) => t.title === tabTitle);
  if (!tab) return; // nothing to style — caller will have surfaced this already

  await googleFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      accessToken,
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: tab.sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: numCols,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.11, green: 0.33, blue: 0.57 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                  },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE',
                },
              },
              fields:
                'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: tab.sheetId,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: tab.sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: numCols,
              },
            },
          },
        ],
      }),
    },
  );
}
