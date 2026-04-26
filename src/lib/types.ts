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

export type UserRole = 'member' | 'super_admin';

export type Profile = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  gmail_address: string | null;
  contact_number: string | null;
  role: UserRole;
};

export type EngagementType = 'retainer' | 'ipo' | 'agm' | 'one_off' | 'crisis';

export type EngagementStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export const ENGAGEMENT_TYPE_LABEL: Record<EngagementType, string> = {
  retainer: 'Retainer',
  ipo: 'IPO',
  agm: 'AGM/EGM',
  one_off: 'One-off',
  crisis: 'Crisis',
};

export const ENGAGEMENT_STATUS_LABEL: Record<EngagementStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type Engagement = {
  engagement_id: string;
  client_id: string;
  name: string;
  engagement_type: EngagementType;
  status: EngagementStatus;
  start_date: string;
  end_date: string | null;
  service_tier: ServiceTier[];
  contract_value: number | null;
  currency: string;
  billing_terms: string | null;
  scope_summary: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliverableKind =
  | 'one_off'
  | 'recurring'
  | 'event_triggered'
  | 'ongoing';

export type DeliverableStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'not_applicable';

export const DELIVERABLE_KIND_LABEL: Record<DeliverableKind, string> = {
  one_off: 'One-off',
  recurring: 'Recurring',
  event_triggered: 'Event-triggered',
  ongoing: 'Ongoing',
};

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  not_applicable: 'Not applicable',
};

export type DeliverableTemplate = {
  template_id: string;
  service_tier: ServiceTier;
  kind: DeliverableKind;
  label: string;
  default_target_count: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ScheduleStatus =
  | 'planned'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  planned: 'Planned',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type DeliverableSchedule = {
  schedule_id: string;
  client_deliverable_id: string;
  engagement_id: string;
  meeting_id: string | null;
  scheduled_at: string;
  location: string | null;
  status: ScheduleStatus;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleAttendee = {
  attendee_id: string;
  schedule_id: string;
  investor_id: string | null;
  name: string | null;
  affiliation: string | null;
  note: string | null;
  created_at: string;
};

export type ClientDeliverable = {
  client_deliverable_id: string;
  client_id: string;
  engagement_id: string;
  template_id: string | null;
  service_tier: ServiceTier;
  kind: DeliverableKind;
  label: string;
  status: DeliverableStatus;
  target_count: number | null;
  completed_count: number;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionItem = {
  action_item_id: string;
  meeting_id: string | null;
  client_id: string | null;
  item: string;
  pic_user_id: string | null;
  due_date: string | null;
  status: ActionItemStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

