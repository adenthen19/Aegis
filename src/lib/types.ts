export type ServiceTier =
  | 'ir' | 'pr' | 'esg' | 'virtual_meeting'
  | 'ipo' | 'agm_egm' | 'social_media' | 'event_management';
export type IpoStatus = 'readiness' | 'roadshow' | 'pricing';
export type AnalystType = 'buy_side' | 'sell_side';
export type PreferredContactMethod = 'email' | 'phone' | 'slack' | 'in_person';
export type MeetingFormat = 'physical' | 'online';
export type MeetingType = 'internal' | 'briefing';
export type ActionItemStatus = 'open' | 'done';
export type ProjectStatus = 'pending' | 'upcoming' | 'completed';

export type Industry =
  | 'industrial_products_services'
  | 'consumer_products_services'
  | 'construction'
  | 'energy'
  | 'financial_services'
  | 'health_care'
  | 'plantation'
  | 'property'
  | 'reit'
  | 'technology'
  | 'telecommunications_media'
  | 'transportation_logistics'
  | 'utilities'
  | 'spac'
  | 'closed_end_fund'
  | 'private_company'
  | 'other';

export type MarketSegment = 'main' | 'ace' | 'leap';

export type Client = {
  client_id: string;
  corporate_name: string;
  ticker_code: string | null;
  industry: Industry | null;
  market_segment: MarketSegment | null;
  financial_year_end: string | null; // 'MM-DD'
  ceo_name: string | null;
  cfo_name: string | null;
  logo_url: string | null;
  service_tier: ServiceTier[];
  ipo_status: IpoStatus | null;
  financial_quarter: string | null;
  internal_controls_audit: boolean;
  advisory_syndicate: unknown;
  created_at: string;
  updated_at: string;
};

export const INDUSTRY_LABEL: Record<Industry, string> = {
  industrial_products_services: 'Industrial Products & Services',
  consumer_products_services: 'Consumer Products & Services',
  construction: 'Construction',
  energy: 'Energy',
  financial_services: 'Financial Services',
  health_care: 'Health Care',
  plantation: 'Plantation',
  property: 'Property',
  reit: 'REIT',
  technology: 'Technology',
  telecommunications_media: 'Telecommunications & Media',
  transportation_logistics: 'Transportation & Logistics',
  utilities: 'Utilities',
  spac: 'SPAC',
  closed_end_fund: 'Closed-End Fund',
  private_company: 'Private Company',
  other: 'Other',
};

export const MARKET_SEGMENT_LABEL: Record<MarketSegment, string> = {
  main: 'Main Market',
  ace: 'ACE Market',
  leap: 'LEAP Market',
};

export type Analyst = {
  investor_id: string;
  full_name: string | null;
  institution_name: string;
  analyst_type: AnalystType;
  contact_number: string | null;
  email: string | null;
  // Legacy columns retained for any pre-existing rows; not edited via the UI anymore.
  asset_class_focus: string | null;
  aum_bracket: number | null;
  interaction_history: unknown;
  sentiment_score: number | null;
  created_at: string;
  updated_at: string;
};

export type MediaContact = {
  media_id: string;
  full_name: string;
  company_name: string | null;
  state: string | null;
  contact_number: string | null;
  email: string | null;
  // Legacy columns retained for any pre-existing rows; not edited via the UI anymore.
  specific_beat_coverage: string | null;
  preferred_contact_method: PreferredContactMethod | null;
  recent_articles: string[];
  social_media_profiles: Record<string, string>;
  spoc: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  project_id: string;
  client_id: string;
  deliverable_name: string;
  status: ProjectStatus;
  deadline: string | null;
  created_at: string;
  updated_at: string;
};

export type Meeting = {
  meeting_id: string;
  meeting_type: MeetingType;
  client_id: string | null;
  investor_id: string | null;
  meeting_format: MeetingFormat;
  meeting_date: string;
  location: string | null;
  attendees: string | null; // legacy free-text, kept for backward-compat
  agenda_items: string[];
  summary: string | null;
  other_remarks: string | null;
  key_takeaways: string | null; // legacy
  created_at: string;
  updated_at: string;
};

export type Profile = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type ActionItem = {
  action_item_id: string;
  meeting_id: string;
  item: string;
  pic_user_id: string | null;
  due_date: string | null;
  status: ActionItemStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

