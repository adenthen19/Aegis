-- Aegis internal portal — initial schema
-- Convention: Postgres snake_case for column identifiers. The original PascalCase
-- names from the spec are noted next to each column for traceability.

-- =====================================================================
-- ENUM TYPES
-- =====================================================================

create type service_tier as enum ('ir', 'pr', 'esg', 'virtual_meeting');
create type ipo_status as enum ('readiness', 'roadshow', 'pricing');
create type analyst_type as enum ('buy_side', 'sell_side');
create type preferred_contact_method as enum ('email', 'phone', 'slack', 'in_person');
create type meeting_format as enum ('physical', 'online');
create type project_status as enum ('pending', 'upcoming', 'completed');

-- =====================================================================
-- TABLES
-- =====================================================================

-- Client Database
create table public.clients (
  client_id uuid primary key default gen_random_uuid(),           -- ClientID
  corporate_name varchar(255) not null,                            -- CorporateName
  service_tier service_tier not null,                              -- ServiceTier
  ipo_status ipo_status,                                           -- IPOStatus
  financial_quarter timestamptz,                                   -- FinancialQuarter
  internal_controls_audit boolean not null default false,          -- InternalControlsAudit
  advisory_syndicate jsonb not null default '[]'::jsonb,           -- AdvisorySyndicate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Analyst & Fund Manager Database
create table public.analysts (
  investor_id uuid primary key default gen_random_uuid(),          -- InvestorID
  institution_name varchar(255) not null,                          -- InstitutionName
  analyst_type analyst_type not null,                              -- AnalystType
  asset_class_focus varchar(255),                                  -- AssetClassFocus
  aum_bracket bigint,                                              -- AUM_Bracket (USD)
  interaction_history jsonb not null default '[]'::jsonb,          -- InteractionHistory
  sentiment_score real,                                            -- SentimentScore (-1.0 to 1.0)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Media Contacts
create table public.media_contacts (
  media_id uuid primary key default gen_random_uuid(),             -- MediaID
  full_name varchar(255) not null,                                 -- FullName
  specific_beat_coverage varchar(255),                             -- SpecificBeatCoverage
  preferred_contact_method preferred_contact_method,               -- PreferredContactMethod
  recent_articles text[] not null default '{}',                    -- RecentArticles (URLs)
  social_media_profiles jsonb not null default '{}'::jsonb,        -- SocialMediaProfiles
  spoc varchar(255),                                               -- SPOC (Aegis internal contact)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Project Tracking
create table public.projects (
  project_id uuid primary key default gen_random_uuid(),           -- ProjectID
  client_id uuid not null references public.clients(client_id) on delete cascade,
  deliverable_name varchar(255) not null,                          -- DeliverableName
  status project_status not null default 'pending',                -- Status
  deadline timestamptz,                                            -- Deadline
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_client_id_idx on public.projects(client_id);
create index projects_status_idx on public.projects(status);

-- Meeting Minutes & Engagement Mapping
create table public.meetings (
  meeting_id uuid primary key default gen_random_uuid(),           -- MeetingID
  client_id uuid references public.clients(client_id) on delete set null,
  investor_id uuid references public.analysts(investor_id) on delete set null,
  meeting_format meeting_format not null,                          -- MeetingFormat
  meeting_date timestamptz not null,                               -- Date
  attendees text,                                                  -- Attendees
  key_takeaways text,                                              -- KeyTakeaways
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meetings_client_id_idx on public.meetings(client_id);
create index meetings_investor_id_idx on public.meetings(investor_id);
create index meetings_date_idx on public.meetings(meeting_date desc);

-- =====================================================================
-- updated_at triggers
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger analysts_set_updated_at before update on public.analysts
  for each row execute function public.set_updated_at();
create trigger media_contacts_set_updated_at before update on public.media_contacts
  for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- Org-scoped: any authenticated Aegis employee may read/write.
-- Anonymous users are denied by default once RLS is enabled with no
-- matching policies. Restrict signups to your domain in Supabase Auth.
-- =====================================================================

alter table public.clients enable row level security;
alter table public.analysts enable row level security;
alter table public.media_contacts enable row level security;
alter table public.projects enable row level security;
alter table public.meetings enable row level security;

-- clients
create policy "auth read clients" on public.clients
  for select to authenticated using (true);
create policy "auth insert clients" on public.clients
  for insert to authenticated with check (true);
create policy "auth update clients" on public.clients
  for update to authenticated using (true) with check (true);
create policy "auth delete clients" on public.clients
  for delete to authenticated using (true);

-- analysts
create policy "auth read analysts" on public.analysts
  for select to authenticated using (true);
create policy "auth insert analysts" on public.analysts
  for insert to authenticated with check (true);
create policy "auth update analysts" on public.analysts
  for update to authenticated using (true) with check (true);
create policy "auth delete analysts" on public.analysts
  for delete to authenticated using (true);

-- media_contacts
create policy "auth read media_contacts" on public.media_contacts
  for select to authenticated using (true);
create policy "auth insert media_contacts" on public.media_contacts
  for insert to authenticated with check (true);
create policy "auth update media_contacts" on public.media_contacts
  for update to authenticated using (true) with check (true);
create policy "auth delete media_contacts" on public.media_contacts
  for delete to authenticated using (true);

-- projects
create policy "auth read projects" on public.projects
  for select to authenticated using (true);
create policy "auth insert projects" on public.projects
  for insert to authenticated with check (true);
create policy "auth update projects" on public.projects
  for update to authenticated using (true) with check (true);
create policy "auth delete projects" on public.projects
  for delete to authenticated using (true);

-- meetings
create policy "auth read meetings" on public.meetings
  for select to authenticated using (true);
create policy "auth insert meetings" on public.meetings
  for insert to authenticated with check (true);
create policy "auth update meetings" on public.meetings
  for update to authenticated using (true) with check (true);
create policy "auth delete meetings" on public.meetings
  for delete to authenticated using (true);
