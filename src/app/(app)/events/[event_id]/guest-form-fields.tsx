'use client';

import { useState } from 'react';
import { TextAreaField, TextField } from '@/components/ui/form';
import TableField from '@/components/seating/table-field';
import {
  GUEST_TIER_LABEL,
  type EventGuest,
  type EventTable,
  type GuestTier,
} from '@/lib/types';

const TIER_OPTIONS: GuestTier[] = ['vip', 'analyst', 'kol', 'media', 'standard'];

// Guest CRUD form fields. Used by the "Add guest" + "Edit guest"
// modals. The visual TablePicker / TableField pair was added so hosts
// don't have to remember and type a table number — they pick from the
// existing tables (with capacity status visible) or fall back to a
// free-text input for tables not yet defined.
export default function GuestFormFields({
  initial,
  tables,
  guests,
  defaultCapacity,
}: {
  initial?: EventGuest;
  /** All existing tables for this event — drives the TablePicker
   *  options. When omitted, falls back to a plain text field. */
  tables?: EventTable[];
  /** All guests for this event — feeds the picker's per-table
   *  capacity / "x of N" indicator. */
  guests?: EventGuest[];
  defaultCapacity?: number | null;
}) {
  // Tier is a controlled field so the TableField can read it for its
  // section-mismatch warning. We default to the row's tier on edit, or
  // 'standard' on create.
  const [tier, setTier] = useState<GuestTier>(initial?.tier ?? 'standard');

  return (
    <>
      <TextField
        name="full_name"
        label="Full name"
        required
        placeholder="e.g. Jane Tan"
        defaultValue={initial?.full_name ?? undefined}
      />
      <TextField
        name="title"
        label="Title / designation"
        placeholder="e.g. Chief Investment Officer"
        defaultValue={initial?.title ?? undefined}
      />
      <TextField
        name="company"
        label="Company"
        placeholder="e.g. Aurora Capital"
        defaultValue={initial?.company ?? undefined}
      />
      <TextField
        name="contact_number"
        label="Contact number"
        placeholder="+60 12-345 6789"
        defaultValue={initial?.contact_number ?? undefined}
      />
      <TextField
        name="email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        defaultValue={initial?.email ?? undefined}
      />
      {/* Tier is rendered as a select that mirrors into a hidden input
          so we can both submit the value and surface section warnings
          on the TableField below. The SelectField helper doesn't expose
          onChange, so we render a native select directly. */}
      <div>
        <label
          htmlFor="tier"
          className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
        >
          Audience tier
        </label>
        <select
          id="tier"
          name="tier"
          value={tier}
          onChange={(e) => setTier(e.target.value as GuestTier)}
          className="w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
        >
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {GUEST_TIER_LABEL[t]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-aegis-gray-300">
          Drives kiosk colour-coding and seating-section warnings.
        </p>
      </div>

      {/* Visual table picker when seating data is available; falls back
          to the legacy free-text field for callers (e.g. tests or any
          modal that doesn't load tables) that haven't been migrated to
          pass the tables/guests props. */}
      {tables && guests ? (
        <TableField
          initial={initial?.table_number ?? null}
          tables={tables}
          guests={guests}
          defaultCapacity={defaultCapacity ?? null}
          guestTier={tier}
          hint="Optional — leave unassigned if the event doesn't use seating."
        />
      ) : (
        <TextField
          name="table_number"
          label="Table number"
          placeholder="e.g. 5, Table 12, VIP-A"
          defaultValue={initial?.table_number ?? undefined}
          hint="Optional — leave blank if the event doesn't use seating."
        />
      )}
      <TextAreaField
        name="notes"
        label="Notes"
        rows={2}
        placeholder="Dietary, seating, RSVP — anything useful on the day."
        defaultValue={initial?.notes ?? undefined}
      />
    </>
  );
}
