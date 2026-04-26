'use client';

import { SelectField, TextField } from '@/components/ui/form';
import type { Profile } from '@/lib/types';

const inputClass =
  'w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10';
const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';

export default function UserFormFields({
  initial,
  isEdit,
  isSelf,
}: {
  initial?: Profile;
  isEdit: boolean;
  isSelf?: boolean;
}) {
  return (
    <>
      {initial && <input type="hidden" name="user_id" value={initial.user_id} />}

      <TextField
        name="display_name"
        label="Name"
        required
        defaultValue={initial?.display_name ?? undefined}
        placeholder="e.g. Sarah Chen"
      />

      <TextField
        name="username"
        label="Username"
        required
        defaultValue={initial?.username ?? undefined}
        placeholder="sarah.chen"
        hint="Used for sign-in. Letters, numbers, dot, dash, underscore."
      />

      <TextField
        name="email"
        type="email"
        label="Company email"
        required
        defaultValue={initial?.email ?? undefined}
        placeholder="sarah@aegiscomm.com.my"
      />

      <TextField
        name="gmail_address"
        type="email"
        label="Gmail address"
        defaultValue={initial?.gmail_address ?? undefined}
        placeholder="sarah.chen@gmail.com"
        hint="Optional — used for Google Drive integrations."
      />

      <TextField
        name="contact_number"
        label="Contact number"
        defaultValue={initial?.contact_number ?? undefined}
        placeholder="+60 12-345 6789"
      />

      <div>
        <label htmlFor="avatar_url" className={labelClass}>
          Profile picture URL
        </label>
        <input
          id="avatar_url"
          name="avatar_url"
          type="url"
          defaultValue={initial?.avatar_url ?? ''}
          placeholder="https://…"
          className={inputClass}
        />
        <p className="mt-1 text-[11px] text-aegis-gray-300">
          Optional. Users can also upload one themselves from their profile menu.
        </p>
      </div>

      <SelectField
        name="role"
        label="Role"
        required
        defaultValue={initial?.role ?? 'member'}
        options={[
          { value: 'member', label: 'Member' },
          { value: 'super_admin', label: 'Super Admin' },
        ]}
        hint={
          isSelf
            ? 'You cannot demote your own account.'
            : 'Super Admins can manage all users.'
        }
      />

      <div>
        <label htmlFor="password" className={labelClass}>
          Password {!isEdit && <span className="ml-0.5 text-aegis-orange">*</span>}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required={!isEdit}
          minLength={8}
          autoComplete="new-password"
          placeholder={isEdit ? 'Leave blank to keep current password' : 'At least 8 characters'}
          className={inputClass}
        />
      </div>
    </>
  );
}
