import type { Industry, IpoStatus, MarketSegment, ServiceTier } from './types';

export const SERVICE_TIER_CODES: ServiceTier[] = [
  'ir', 'pr', 'esg', 'virtual_meeting',
  'ipo', 'agm_egm', 'social_media', 'event_management',
];
export const IPO_STATUS_CODES: IpoStatus[] = [
  'stage_1_pre_ipo',
  'stage_2_approval',
  'stage_3_underwriting',
  'stage_4_prospectus',
  'stage_5_balloting',
  'stage_6_listing',
];
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
  'Dec-31',
  'ir;pr;esg',
  'stage_1_pre_ipo',
  'Q4 2025',
  'true',
];

export const CLIENT_IMPORT_FIELD_HELP: { name: string; required?: boolean; help: string }[] = [
  { name: 'corporate_name', required: true, help: 'Company legal/trading name.' },
  { name: 'ticker_code', help: 'Stock ticker (uppercased automatically). Leave blank for private.' },
  {
    name: 'industry',
    help: `Optional. One of: ${INDUSTRY_CODES.join(', ')}.`,
  },
  {
    name: 'market_segment',
    help: `Optional. One of: ${MARKET_SEGMENT_CODES.join(', ')}.`,
  },
  {
    name: 'financial_year_end',
    help: 'Optional. Examples: Dec-31, 31-Dec, 12-31, 31/12, 2025-12-31. Year is ignored — only month and day matter.',
  },
  {
    name: 'service_tier',
    help: `Optional. Semicolon-separated. One or more of: ${SERVICE_TIER_CODES.join(', ')}. Leave blank to set tiers later — the auto-engagement won't be created until at least one tier is set.`,
  },
  {
    name: 'ipo_status',
    help: `Optional. Only for IPO clients. One of: ${IPO_STATUS_CODES.join(', ')}.`,
  },
  { name: 'financial_quarter', help: 'Optional. Free text e.g. "Q4 2025".' },
  { name: 'internal_controls_audit', help: 'Optional. true or false. Defaults to false.' },
];
