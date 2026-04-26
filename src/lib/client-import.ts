import type { Industry, IpoStatus, MarketSegment, ServiceTier } from './types';

export const SERVICE_TIER_CODES: ServiceTier[] = [
  'ir', 'pr', 'esg', 'virtual_meeting',
  'ipo', 'agm_egm', 'social_media', 'event_management',
];
export const IPO_STATUS_CODES: IpoStatus[] = ['readiness', 'roadshow', 'pricing'];
export const INDUSTRY_CODES: Industry[] = [
  'industrial_products_services', 'consumer_products_services', 'construction',
  'energy', 'financial_services', 'health_care', 'plantation', 'property',
  'reit', 'technology', 'telecommunications_media', 'transportation_logistics',
  'utilities', 'spac', 'closed_end_fund', 'private_company', 'other',
];
export const MARKET_SEGMENT_CODES: MarketSegment[] = ['main', 'ace', 'leap'];

export const CLIENT_IMPORT_HEADERS = [
  'corporate_name',
  'ticker_code',
  'industry',
  'market_segment',
  'financial_year_end',
  'ceo_name',
  'cfo_name',
  'service_tier',
  'ipo_status',
  'financial_quarter',
  'internal_controls_audit',
] as const;

export const CLIENT_IMPORT_EXAMPLE_ROW: string[] = [
  'Acme Holdings Berhad',
  'ACME',
  'technology',
  'main',
  '12-31',
  'Jane Tan',
  'John Lee',
  'ir;pr;esg',
  'readiness',
  'Q4 2025',
  'true',
];

export const CLIENT_IMPORT_FIELD_HELP: { name: string; required?: boolean; help: string }[] = [
  { name: 'corporate_name', required: true, help: 'Company legal/trading name.' },
  { name: 'ticker_code', help: 'Stock ticker (uppercased automatically). Leave blank for private.' },
  {
    name: 'industry',
    help: `One of: ${INDUSTRY_CODES.join(', ')}.`,
  },
  {
    name: 'market_segment',
    help: `One of: ${MARKET_SEGMENT_CODES.join(', ')}.`,
  },
  { name: 'financial_year_end', help: 'MM-DD format, e.g. 12-31.' },
  { name: 'ceo_name', help: 'Optional.' },
  { name: 'cfo_name', help: 'Optional.' },
  {
    name: 'service_tier',
    required: true,
    help: `Semicolon-separated. One or more of: ${SERVICE_TIER_CODES.join(', ')}.`,
  },
  {
    name: 'ipo_status',
    help: `Only for IPO clients. One of: ${IPO_STATUS_CODES.join(', ')}.`,
  },
  { name: 'financial_quarter', help: 'Free text e.g. "Q4 2025".' },
  { name: 'internal_controls_audit', help: 'true or false. Defaults to false.' },
];
