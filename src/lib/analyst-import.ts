import type { AnalystType } from './types';

export const ANALYST_TYPE_CODES: AnalystType[] = ['buy_side', 'sell_side'];

export const ANALYST_IMPORT_HEADERS = [
  'institution_name',
  'full_name',
  'analyst_type',
  'email',
  'contact_number',
] as const;

export const ANALYST_IMPORT_EXAMPLE_ROW: string[] = [
  'Maybank Investment Bank',
  'Tan Wei Ming',
  'sell_side',
  'wei.ming@maybank.com',
  '+60 12-345 6789',
];

export const ANALYST_IMPORT_FIELD_HELP: { name: string; required?: boolean; help: string }[] = [
  {
    name: 'institution_name',
    required: true,
    help: 'Bank, fund, or research house. Required.',
  },
  { name: 'full_name', help: 'Analyst / fund manager name. Optional.' },
  {
    name: 'analyst_type',
    required: true,
    help: `One of: ${ANALYST_TYPE_CODES.join(', ')}.`,
  },
  { name: 'email', help: 'Optional. Used by the email-export feature.' },
  { name: 'contact_number', help: 'Optional.' },
];
