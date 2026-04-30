// CSV import schema for an event guest list. Mirrors lib/client-import.ts.
// Five columns: full_name (required) + the four contact fields. Notes is
// optional in the file but supported if present.

export const EVENT_GUEST_IMPORT_HEADERS = [
  'full_name',
  'title',
  'company',
  'contact_number',
  'email',
  'table_number',
  'notes',
] as const;

export const EVENT_GUEST_IMPORT_EXAMPLE_ROW: string[] = [
  'Jane Tan',
  'Chief Investment Officer',
  'Aurora Capital',
  '+60 12-345 6789',
  'jane.tan@aurora.com',
  'Table 5',
  'VIP — front row',
];

export const EVENT_GUEST_IMPORT_FIELD_HELP: {
  name: string;
  required?: boolean;
  help: string;
}[] = [
  { name: 'full_name', required: true, help: 'Guest name as it should appear on the list.' },
  { name: 'title', help: 'Optional. Designation, e.g. CIO, Senior Reporter.' },
  { name: 'company', help: 'Optional. Affiliation / employer.' },
  { name: 'contact_number', help: 'Optional. Mobile or office number — free-text.' },
  { name: 'email', help: 'Optional but recommended — used to dedupe re-imports.' },
  { name: 'table_number', help: 'Optional. Free-text, e.g. "5", "Table 12", "VIP-A".' },
  { name: 'notes', help: 'Optional. Dietary, seating, RSVP — anything useful on the day.' },
];
