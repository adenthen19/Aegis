'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024;

export default function AvatarUpload({
  userId,
  defaultUrl,
  fallbackInitial,
  onChange,
}: {
  userId: string;
  defaultUrl?: string | null;
  fallbackInitial?: string;
  onChange: (url: string | null) => void;
}) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(defaultUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function notify(next: string | null) {
    setUrl(next);
    onChange(next);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be under 2 MB.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      notify(data.publicUrl);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function clear() {
    setError(null);
    notify(null);
  }

  return (
    <div>
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500">
        Profile picture
      </span>

      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-aegis-gray-200 bg-aegis-blue text-aegis-navy">
          {url ? (
            <Image
              src={url}
              alt="Profile"
              width={80}
              height={80}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xl font-semibold">{fallbackInitial ?? '?'}</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Uploading…
                </>
              ) : (
                <>{url ? 'Replace' : 'Upload'} photo</>
              )}
            </button>
            {url && (
              <button
                type="button"
                onClick={clear}
                disabled={uploading}
                className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-aegis-gray-500 hover:text-aegis-orange-600"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-aegis-gray-300">PNG / JPG · max 2 MB.</p>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {error && <p className="mt-2 text-xs text-aegis-orange-600">{error}</p>}
    </div>
  );
}
