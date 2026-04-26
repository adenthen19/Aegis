export const MEDIA_IMPORT_HEADERS = [
  'full_name',
  'company_name',
  'state',
  'email',
  'contact_number',
] as const;

export const MEDIA_IMPORT_EXAMPLE_ROW: string[] = [
  'Lim Mei Ling',
  'The Edge Malaysia',
  'Kuala Lumpur',
  'meiling@theedgemarkets.com',
  '+60 12-345 6789',
];

export const MEDIA_IMPORT_FIELD_HELP: { name: string; required?: boolean; help: string }[] = [
  { name: 'full_name', required: true, help: 'Reporter / journalist name. Required.' },
  { name: 'company_name', help: 'Publication / outlet. Optional.' },
  { name: 'state', help: 'State or region. Optional.' },
  { name: 'email', help: 'Optional. Used by the email-export feature.' },
  { name: 'contact_number', help: 'Optional.' },
];
