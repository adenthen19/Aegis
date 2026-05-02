export type ServiceTier =
  | 'ir' | 'pr' | 'esg' | 'virtual_meeting'
  | 'ipo' | 'agm_egm' | 'social_media' | 'event_management';
export type IpoStatus =
  | 'stage_1_pre_ipo'
  | 'stage_2_approval'
  | 'stage_3_underwriting'
  | 'stage_4_prospectus'
  | 'stage_5_balloting'
  | 'stage_6_listing';

export const IPO_STATUS_LABEL: Record<IpoStatus, string> = {
  stage_1_pre_ipo: 'Stage 1 — Pre-IPO preparations',
  stage_2_approval: 'Stage 2 — Approval from authority',
  stage_3_underwriting: 'Stage 3 — Signing of underwriting agreement',
  stage_4_prospectus: 'Stage 4 — Prospectus launch',
  stage_5_balloting: 'Stage 5 — Balloting',
  stage_6_listing: 'Stage 6 — Listing',
};
export type AnalystType = 'buy_side' | 'sell_side';
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
  logo_url: string | null;
  service_tier: ServiceTier[];
  ipo_status: IpoStatus | null;
  financial_quarter: string | null;
  internal_controls_audit: boolean;
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
  // Sentiment score is a -1.0..+1.0 rolling figure rendered on the dashboard.
  // Will be populated by Phase 4 AI scoring of meetings + coverage.
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
  agenda_items: string[];
  summary: string | null;
  other_remarks: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRole = 'member' | 'director' | 'super_admin';

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  member: 'Member',
  director: 'Director',
  super_admin: 'Super Admin',
};

export type Profile = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  gmail_address: string | null;
  contact_number: string | null;
  role: UserRole;
  birthday: string | null; // ISO date, year may be 1900 if user opted not to share it
};

export type StakeholderCategory = 'executive' | 'board' | 'advisor' | 'other';

export const STAKEHOLDER_CATEGORY_LABEL: Record<StakeholderCategory, string> = {
  executive: 'Executive',
  board: 'Board',
  advisor: 'Advisor',
  other: 'Other',
};

export type ClientStakeholder = {
  stakeholder_id: string;
  client_id: string;
  category: StakeholderCategory;
  role: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentCategory =
  | 'press_release'
  | 'qa_pack'
  | 'media_kit'
  | 'results'
  | 'board_pack'
  | 'clipping'
  | 'report'
  | 'contract'
  | 'pr_value_report'
  | 'other';

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  press_release: 'Press release',
  qa_pack: 'Q&A pack',
  media_kit: 'Media kit',
  results: 'Results',
  board_pack: 'Board pack',
  clipping: 'Clipping',
  report: 'Report',
  contract: 'Contract',
  pr_value_report: 'PR value report',
  other: 'Other',
};

export type Document = {
  document_id: string;
  client_id: string;
  engagement_id: string | null;
  client_deliverable_id: string | null;
  schedule_id: string | null;
  meeting_id: string | null;
  press_release_id: string | null;
  coverage_id: string | null;
  pr_value_report_id: string | null;
  name: string;
  // Exactly one of file_path / external_url is set per row.
  file_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  category: DocumentCategory;
  description: string | null;
  version: number;
  replaces_document_id: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PressReleaseType =
  | 'results'
  | 'corporate_action'
  | 'ipo'
  | 'agm_egm'
  | 'esg'
  | 'product'
  | 'crisis'
  | 'ad_hoc'
  | 'other';

export const PRESS_RELEASE_TYPE_LABEL: Record<PressReleaseType, string> = {
  results: 'Results',
  corporate_action: 'Corporate action',
  ipo: 'IPO',
  agm_egm: 'AGM/EGM',
  esg: 'ESG',
  product: 'Product / contract',
  crisis: 'Crisis',
  ad_hoc: 'Ad-hoc',
  other: 'Other',
};

export type PressReleaseStatus =
  | 'draft'
  | 'approved'
  | 'distributed'
  | 'archived';

export const PRESS_RELEASE_STATUS_LABEL: Record<PressReleaseStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  distributed: 'Distributed',
  archived: 'Archived',
};

export type PressRelease = {
  press_release_id: string;
  client_id: string;
  engagement_id: string | null;
  client_deliverable_id: string | null;
  title: string;
  release_type: PressReleaseType;
  status: PressReleaseStatus;
  release_date: string | null;
  distributed_at: string | null;
  body: string | null;
  distribution_media_ids: string[];
  distribution_notes: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CoverageType = 'online' | 'print' | 'broadcast' | 'social';

export const COVERAGE_TYPE_LABEL: Record<CoverageType, string> = {
  online: 'Online',
  print: 'Print',
  broadcast: 'Broadcast',
  social: 'Social',
};

export type CoverageSentiment = 'positive' | 'neutral' | 'negative';

export const COVERAGE_SENTIMENT_LABEL: Record<CoverageSentiment, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
};

export type MediaCoverage = {
  coverage_id: string;
  client_id: string;
  press_release_id: string | null;
  media_id: string | null;
  publication_name: string;
  reporter_name: string | null;
  coverage_type: CoverageType;
  publication_date: string;
  headline: string;
  url: string | null;
  reach_estimate: number | null;
  sentiment: CoverageSentiment | null;
  tone_tags: string[];
  ave_value: number | null;
  prv_value: number | null;
  currency: string;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PrValueReport = {
  report_id: string;
  client_id: string;
  engagement_id: string | null;
  title: string;
  period_start: string;
  period_end: string;
  total_coverage_count: number;
  total_reach: number;
  total_ave: number;
  total_prv: number;
  currency: string;
  notes: string | null;
  generated_pdf_document_id: string | null;
  sent_to_client_at: string | null;
  sent_to_email: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
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
  due_date: string | null;
  auto_generated_key: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionItem = {
  action_item_id: string;
  meeting_id: string | null;
  client_id: string | null;
  client_deliverable_id: string | null;
  item: string;
  pic_user_id: string | null;
  due_date: string | null;
  status: ActionItemStatus;
  completed_at: string | null;
  auto_generated_key: string | null;
  created_at: string;
  updated_at: string;
};

export type EventStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  planned: 'Planned',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type EventRow = {
  event_id: string;
  client_id: string | null;
  adhoc_client_name: string | null;
  name: string;
  event_date: string;
  location: string | null;
  description: string | null;
  status: EventStatus;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InterviewFormat = 'in_person' | 'phone' | 'video' | 'email';

export const INTERVIEW_FORMAT_LABEL: Record<InterviewFormat, string> = {
  in_person: 'In person',
  phone: 'Phone',
  video: 'Video call',
  email: 'Email',
};

export type InterviewStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'postponed';

export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

export type MediaInterview = {
  interview_id: string;
  client_id: string;
  engagement_id: string | null;
  client_deliverable_id: string | null;
  media_id: string | null;
  publication_name: string | null;
  reporter_name: string | null;
  spokesperson_name: string | null;
  interview_date: string;
  interview_format: InterviewFormat;
  status: InterviewStatus;
  topic: string | null;
  expected_publish_date: string | null;
  coverage_id: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EventGuest = {
  guest_id: string;
  event_id: string;
  full_name: string;
  title: string | null;
  company: string | null;
  contact_number: string | null;
  email: string | null;
  table_number: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EventCheckinAction = 'checkin' | 'undo';
export type EventCheckinSource = 'kiosk' | 'admin';

export const EVENT_CHECKIN_ACTION_LABEL: Record<EventCheckinAction, string> = {
  checkin: 'Checked in',
  undo: 'Undo check-in',
};

export const EVENT_CHECKIN_SOURCE_LABEL: Record<EventCheckinSource, string> = {
  kiosk: 'Kiosk',
  admin: 'Admin',
};

export type EventGuestCheckin = {
  checkin_id: string;
  guest_id: string;
  event_id: string;
  action: EventCheckinAction;
  source: EventCheckinSource;
  performed_by_user_id: string | null;
  performed_at: string;
  notes: string | null;
};

