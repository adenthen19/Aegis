'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/modal';
import { createClient } from '@/lib/supabase/client';
import AvatarUpload from './avatar-upload';

export default function ProfileDialog({
  open, onClose, userId, email, displayName, avatarUrl,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(displayName);
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name cannot be empty.');
      return;
    }
    setError(null);
    setSaving(true);
    const { error: updateErr } = await supabase.auth.updateUser({
      data: { display_name: trimmed, avatar_url: avatar },
    });
    setSaving(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    onClose();
    startTransition(() => router.refresh());
  }

  const initial = (displayName || email || '?').charAt(0).toUpperCase();

  return (
    <Modal open={open} onClose={onClose} title="Your profile" description="Edit how you appear in the portal.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <AvatarUpload
          userId={userId}
          defaultUrl={avatar}
          fallbackInitial={initial}
          onChange={setAvatar}
        />

        <div>
          <label
            htmlFor="profile-name"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
          >
            Display name
          </label>
          <input
            id="profile-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500">
            Email
          </span>
          <p className="rounded-md border border-aegis-gray-100 bg-aegis-gray-50/60 px-3 py-2 text-sm text-aegis-gray-500">
            {email}
          </p>
          <p className="mt-1 text-[11px] text-aegis-gray-300">Email is managed via Supabase Auth.</p>
        </div>

        {error && (
          <div className="rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2 text-xs text-aegis-orange-600">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-aegis-orange-600 disabled:opacity-60"
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
