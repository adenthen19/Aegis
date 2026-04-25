# Aegis Portal — Roadmap

A pragmatic plan for evolving the internal portal into a complete IR / PR / ESG operations platform. Items are grouped by phase. Priority assumes a small team (2–10 internal users) running a real client book.

---

## Where we are today

**Built**
- Auth (Supabase email/password, RLS-gated, middleware redirect)
- 5 tables with full CRUD (Create / Read / **Update** / **Delete**) — Clients, Analysts & Funds, Media Contacts, Projects, Meetings
- **Extended client schema**: ticker code, industry (16 Bursa Malaysia sectors), market segment (Main/ACE/LEAP), CEO/CFO names, financial year end (MM-DD), **logo upload via Supabase Storage**
- Dashboard with KPIs (with weekly deltas), pipeline status, sentiment & tier distribution, upcoming deadlines, recent meetings, conditional overdue alert
- Branded UI (navy + light blue + orange + gold), responsive, mobile drawer + collapsible desktop sidebar
- JSON-column editing for `advisory_syndicate`, `interaction_history`, `social_media_profiles`
- Service tier multi-select array (8 tiers including IPO, AGM/EGM, Social Media, Event Management)
- **✅ Phase 1.1** — search input on every list page (URL-driven, debounced)
- **✅ Phase 1.2** — sortable columns (URL-driven, sort indicators on active column)
- **✅ Phase 1.3** — server-side pagination (25/page, prev/next, "Showing X–Y of Z")
- **✅ Phase 1.4** — detail pages for all 5 entities, with related items (client → projects + meetings, analyst → meetings, project ↔ client, meeting ↔ client + investor)
- **✅ FilterTabs** for projects (status) and meetings (format), URL-driven

**Known limitations** (still acceptable for v1)
- **Phase 1.5 (CSV import) not built** — manual entry only
- No file attachments (other than client logos)
- No activity timeline / audit trail
- Single role (every authenticated user can do everything)
- Dates use HTML5 native pickers (no quarter selector)

---

## Phase 1 — Make the existing data more usable (1–2 weeks)

These are the highest-value next steps. They turn the database from a viewer into a work tool.

### ✅ 1.1 Search & filter on every list page — DONE
- ✅ Debounced search input above each table (URL-driven via `?q=`)
- ✅ Filter pills for projects (status) and meetings (format)
- ✅ Bookmarkable URLs (filter state lives in the query string)
- TODO: clients tier filter, analyst type filter, meetings date range

### ✅ 1.2 Sortable columns — DONE
- ✅ Click a column header → server-side `order` flip (`?sort=col&dir=asc`)
- ✅ Up/down arrow indicator on the active sort column

### ✅ 1.3 Pagination — DONE
- ✅ Server-side limit/offset, 25 rows/page, "Showing X–Y of Z" footer
- ✅ Prev/Next links with disabled state at boundaries

### ✅ 1.4 Detail pages — DONE
- ✅ `/clients/[id]`, `/analysts/[id]`, `/media/[id]`, `/projects/[id]`, `/meetings/[id]`
- ✅ Related items (client → projects + meetings, investor → meetings, etc.)
- ✅ Edit / delete affordances on detail pages

### 1.5 Bulk-import via CSV — TODO
- "Import" button on each list page → upload a CSV → map columns → preview → commit
- One-time setup is the painful part of any CRM; CSV import removes it

---

## Phase 2 — Calendar, files, and audit (2–3 weeks)

Closer to what an IR firm actually does day-to-day.

### 2.1 Calendar view
- New `/calendar` route — month/week view of meetings + project deadlines
- Color-coded: navy = meeting, gold = project deadline, orange = overdue
- Click an event → opens its detail modal
- Subscribe link (iCal feed) so it shows up in Outlook / Google Calendar

### 2.2 File attachments
- Supabase Storage bucket per entity (e.g. `meeting-attachments/`, `project-files/`)
- Upload / download / delete from each detail page
- Preview for PDFs, images
- File metadata table linking back to the parent record

### 2.3 Audit log
- New `audit_log` table: `(id, actor_email, action, table_name, row_id, changes_jsonb, created_at)`
- Server actions write an entry on every insert/update/delete
- New `/audit` page (admin-only) with filterable trail
- Crucial for IR work — investor-facing decisions need provenance

### 2.4 Notifications panel
- Bell icon in top-right of header → dropdown of:
  - Projects due in 3 days
  - Overdue projects
  - Sentiment shifts (any analyst dropping > 0.3 in a week)
  - Meetings tomorrow
- Stored in a `notifications` table; mark-as-read state per user

---

## Phase 3 — Comms workflows (3–5 weeks)

Where the portal stops being a CRM and starts being IR-specific.

### 3.1 Email integration
- "Send email" affordance on contact detail pages — drafts open in default mail client (`mailto:` v1) or push to Gmail / Outlook via OAuth (v2)
- Log every sent email as an interaction on the contact

### 3.2 Distribution lists
- Static + dynamic lists (e.g. "All buy-side covering Healthcare", "Press list — UK fintech")
- Send to list → expands recipients → tracks the campaign
- Opt-out / unsubscribe handling (GDPR-relevant)

### 3.3 Press release workflow
- New `press_releases` table: `(id, client_id, title, body, status, embargo_at, distributed_at)`
- States: Draft → Internal review → Client review → Embargoed → Distributed
- Approval comments per state transition
- Distribution writes one meeting/interaction record per recipient list

### 3.4 Earnings call coordination
- Link a project to an `earnings_call`: `(date, prep_doc_url, attendees, transcript_url, q_and_a_jsonb)`
- Q&A prep workspace — common questions, prepared answers, who's covering what
- Post-call: log the transcript, attach analysts who attended (auto-creates meeting records)

### 3.5 Roadshow planner
- Multi-city, multi-day investor meeting scheduling
- Drag-and-drop slots to investors (analysts table)
- Generates one meeting record per slot on confirmation
- Travel/hotel notes per city

---

## Phase 4 — Insight & intelligence (4–6 weeks)

### 4.1 Sentiment trend tracking
- `sentiment_history` table — snapshot scores over time (auto-snapshot on update)
- Per-analyst trend chart on detail page
- Aggregate trend across the coverage universe on the dashboard

### 4.2 AI-assisted summaries
- "Summarize" button on long meeting takeaways → calls Anthropic API (Claude) to produce a 3-bullet summary
- Auto-tag interactions with sentiment (positive/neutral/negative) using LLM
- Optional: generate sentiment_score from key_takeaways text

### 4.3 Quarterly reports
- One-click "Generate Q1 2026 client report" → PDF with:
  - All meetings logged
  - Project status summary
  - Sentiment movement
  - Press hits (recent_articles + media activity)
- Sharable via signed URL (no auth required for the client)

### 4.4 Saved views
- Per-user saved filter sets ("My overdue projects", "This week's meetings", "Healthcare buy-side")
- Pinned to the sidebar under a "Views" section

---

## Phase 5 — Permissions, scale, security (ongoing)

### 5.1 Roles
- Add `user_role` enum: `admin | manager | analyst | viewer`
- Per-row RLS policies that respect role
- Invite flow for new team members (admin sends invite → user signs up via magic link)
- Hide destructive actions from `viewer` role

### 5.2 Two-factor auth
- Supabase Auth supports TOTP — enable + enforce for `admin`/`manager`
- Required for any IR/PR firm handling MNPI

### 5.3 Compliance dashboard
- Disclosure deadlines tracker
- MNPI-tagging for meetings (chinese-wall reminders)
- Insider list management (who knows what, when)
- SOX / SOC2 audit trail exports

### 5.4 Performance
- Migrate large lists to streaming + virtualization (`react-virtual`) when rows > ~500
- Add Postgres indexes for frequently-filtered columns
- Cache dashboard aggregates (Supabase Edge Functions or materialized views, refreshed every 15 min)

### 5.5 Backups & DR
- Automated nightly snapshots (Supabase already does this on Pro)
- Document restore procedure
- Periodic export of all 5 tables → S3 cold storage (compliance retention)

---

## Phase 6 — Polish (anytime)

Small things that compound:

- **Quarter picker** — "Q1 2026" widget for `financial_quarter` instead of date input
- **Tag system** — free-form tags on every entity, filterable
- **Keyboard shortcuts** — `n c` = new client, `n p` = new project, `cmd-k` for command palette
- **Dark mode** — manual toggle (auto detection is too brittle for brand consistency)
- **PWA / installable** — `manifest.json` so the portal installs on iOS/Android home screens; offline read works for cached pages
- **Dashboard customization** — let users pin/reorder cards
- **Activity feed widget** on the dashboard ("Sarah created Aurora Capital · 2h ago")
- **CSV/PDF export** — every list page gets an "Export" button

---

## What I'd build first if I were you

1. **Search + filter + pagination** (Phase 1.1–1.3) — single highest impact. Without it, the portal won't scale past ~50 records per table.
2. **Detail pages** (1.4) — needed for Phase 2 (calendar links, file uploads attach to a record).
3. **Audit log** (2.3) — once real data is flowing, you can't safely add this retroactively.
4. **Roles** (5.1) — before letting more than ~3 people in.
5. **Email integration** (3.1) — biggest day-to-day workflow win for an IR/PR team.

Everything else can wait until those five exist.

---

## Audit findings from the current codebase

A few small things I noticed scanning the project that aren't blocking but worth tidying:

- **Dashboard query joins** use `as unknown as ProjectRow[]` casts because Supabase's TS inference treats embedded relations as arrays for many-to-one joins. This is a known SDK quirk. Long-term fix: generate types from the database (`supabase gen types typescript`) so the inferred types match reality.
- **Default emoji rendering** in dashboard / login uses native characters (e.g. arrows). On older Windows browsers these might look chunky — consider replacing inline arrows with the same SVG icons used in the sidebar.
- **No favicon** beyond Next.js default. If you have a square mark-only logo, drop it at `src/app/icon.png` to brand the browser tab.
- **Service tier `event_management`** hint says "Event Management" in some places, "Events" in others. Pick one and update enum + label table.
- **Mobile drawer doesn't trap focus** when open — keyboard users can tab into the hidden background content. Needs a focus trap (small fix when you tackle accessibility).
- **`next.config.ts` has no image domains configured** — fine today (logo is served from `/public`), but if you add remote avatars or media thumbnails later, you'll need to whitelist domains.
- **No error boundaries** — if a Supabase query throws, you'll see Next's default error page. Adding `error.tsx` per route group gives a friendlier fallback.

None of these are urgent, but each one becomes harder to fix the more code you stack on top.
