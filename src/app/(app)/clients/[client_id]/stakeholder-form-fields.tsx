'use client';

import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import {
  STAKEHOLDER_CATEGORY_LABEL,
  type ClientStakeholder,
  type StakeholderCategory,
} from '@/lib/types';

const CATEGORY_OPTIONS = (
  Object.keys(STAKEHOLDER_CATEGORY_LABEL) as StakeholderCategory[]
).map((c) => ({ value: c, label: STAKEHOLDER_CATEGORY_LABEL[c] }));

export default function StakeholderFormFields({
  initial,
  clientId,
}: {
  initial?: ClientStakeholder;
  clientId: string;
}) {
  return (
    <>
      {initial && (
        <input type="hidden" name="stakeholder_id" value={initial.stakeholder_id} />
      )}
      <input type="hidden" name="client_id" value={clientId} />

      <SelectField
        name="category"
        label="Category"
        required
        defaultValue={initial?.category ?? 'executive'}
        options={CATEGORY_OPTIONS}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="role"
          label="Role"
          required
          placeholder="e.g. CEO, Company Secretary, Audit Partner"
          defaultValue={initial?.role ?? undefined}
        />
        <TextField
          name="full_name"
          label="Name"
          required
          placeholder="e.g. Tan Sri Wong Wai Hung"
          defaultValue={initial?.full_name ?? undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="email"
          type="email"
          label="Email"
          placeholder="optional"
          defaultValue={initial?.email ?? undefined}
        />
        <TextField
          name="phone"
          label="Phone"
          placeholder="+60 12-345 6789"
          defaultValue={initial?.phone ?? undefined}
        />
      </div>

      <CheckboxField
        name="is_primary"
        label="Primary contact for IR comms"
        defaultChecked={initial?.is_primary}
        hint="Only one stakeholder per client can be primary. Promoting this one demotes any other."
      />

      <TextAreaField
        name="notes"
        label="Notes"
        rows={2}
        defaultValue={initial?.notes ?? undefined}
      />
    </>
  );
}
