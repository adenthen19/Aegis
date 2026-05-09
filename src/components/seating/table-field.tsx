'use client';

import { useState } from 'react';
import TablePicker from './table-picker';
import type { EventGuest, EventTable, GuestTier } from '@/lib/types';

// Form-friendly wrapper around TablePicker for the admin "Add guest"
// and "Edit guest" flows.
//
// The picker visualises every existing table with its current capacity
// state so the user can pick at a glance instead of typing a free-form
// "5" or "VIP-A". For the rare case where the host wants to assign a
// guest to a table that hasn't been pre-registered yet (and isn't
// inferred from any other guest's row), there's a "Type new table…"
// escape hatch that flips the input into a plain text field.
//
// The component renders a hidden input named after the form field
// (default `table_number`) so the existing server action shape doesn't
// have to change — submitting the surrounding form sees the same
// `table_number` string it always has.
export default function TableField({
  name = 'table_number',
  initial,
  guests,
  tables,
  defaultCapacity,
  guestTier,
  hint,
}: {
  name?: string;
  initial: string | null;
  guests: EventGuest[];
  tables: EventTable[];
  defaultCapacity: number | null;
  /** Optional tier of the guest being edited — drives the section
   *  mismatch warning inside TablePicker. */
  guestTier?: GuestTier;
  hint?: string;
}) {
  // Decide initial mode: if the initial value is a string that doesn't
  // match any existing table number, default to "custom" so the user
  // sees what's currently set without losing it. Otherwise start in
  // picker mode (the common case for fresh adds).
  const trimmedInitial = (initial ?? '').trim();
  const initialMatchesExisting = tables.some(
    (t) => t.table_number === trimmedInitial,
  );
  const initialFromGuestList = guests.some(
    (g) => g.table_number?.trim() === trimmedInitial,
  );
  const startInCustom =
    trimmedInitial.length > 0 &&
    !initialMatchesExisting &&
    !initialFromGuestList;

  const [mode, setMode] = useState<'pick' | 'custom'>(
    startInCustom ? 'custom' : 'pick',
  );
  const [pickerValue, setPickerValue] = useState<string | null>(
    startInCustom ? null : trimmedInitial || null,
  );
  const [customValue, setCustomValue] = useState<string>(
    startInCustom ? trimmedInitial : '',
  );

  // The value submitted with the form. Always the canonical trimmed
  // string for whichever mode is active. Empty string for "no table".
  const submittedValue =
    mode === 'custom'
      ? customValue.trim()
      : pickerValue?.trim() ?? '';

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500">
          Table
        </span>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'pick' ? 'custom' : 'pick'))}
          className="text-[11px] font-medium text-aegis-navy hover:text-aegis-orange"
        >
          {mode === 'pick' ? 'Type new table…' : 'Pick from existing'}
        </button>
      </div>

      {/* The hidden input is what the server action reads. Empty string
          becomes null in the action via `formData.get(...).trim() || null`. */}
      <input type="hidden" name={name} value={submittedValue} />

      {mode === 'pick' ? (
        <TablePicker
          tables={tables}
          guests={guests}
          defaultCapacity={defaultCapacity}
          value={pickerValue}
          onChange={setPickerValue}
          allowUnassigned
          guestTier={guestTier}
          emptyHint="No tables defined yet — switch to Type new table to enter one freely."
        />
      ) : (
        <input
          type="text"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder='e.g. 5, Table 12, "VIP-A"'
          className="w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
        />
      )}

      {hint && (
        <p className="mt-1 text-[11px] text-aegis-gray-300">{hint}</p>
      )}
    </div>
  );
}
