'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { removeLogoBackground } from '@/lib/logo-background';

const BUCKET = 'client-logos';
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export default function ClientLogoUpload({
  defaultUrl,
  name = 'logo_url',
}: {
  defaultUrl?: string | null;
  name?: string;
}) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(defaultUrl ?? null);
  // When the user uploads a fresh image we keep the original around so they
  // can flip back if our background-removal pass made things worse for an
  // unusual logo (e.g. one with a deliberate background colour).
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [removedUrl, setRemovedUrl] = useState<string | null>(null);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'uploading' | 'removing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadBlob(blob: Blob, ext: string, contentType: string): Promise<string | null> {
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType, upsert: false });
    if (upErr) {
      setError(upErr.message);
      return null;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
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

    setBusy('uploading');
    try {
      const originalExt = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const originalPublic = await uploadBlob(file, originalExt, file.type);
      if (!originalPublic) return;
      setOriginalUrl(originalPublic);

      // Auto-attempt background removal. SVGs and any failure cases just keep
      // the original — the user can also flip back manually with the toggle.
      setBusy('removing');
      const stripped = await removeLogoBackground(file, file.type);
      if (stripped.ok && stripped.blob !== file) {
        const removedPublic = await uploadBlob(stripped.blob, 'png', 'image/png');
        if (removedPublic) {
          setRemovedUrl(removedPublic);
          setUrl(removedPublic);
          setShowingOriginal(false);
        } else {
          setUrl(originalPublic);
          setShowingOriginal(true);
        }
      } else {
        setRemovedUrl(null);
        setUrl(originalPublic);
        setShowingOriginal(true);
      }
    } finally {
      setBusy('idle');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function clear() {
    setUrl(null);
    setOriginalUrl(null);
    setRemovedUrl(null);
    setShowingOriginal(false);
    setError(null);
  }

  function toggleOriginal() {
    if (!originalUrl || !removedUrl) return;
    if (showingOriginal) {
      setUrl(removedUrl);
      setShowingOriginal(false);
    } else {
      setUrl(originalUrl);
      setShowingOriginal(true);
    }
  }

  const uploading = busy === 'uploading';
  const removing = busy === 'removing';

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500">
        Company logo
      </span>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div
          className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-aegis-gray-200 bg-aegis-gray-50 p-2"
          // Checkered background visualises any transparency in the bg-removed
          // logo so the user can see whether the cut-out worked.
          style={
            url && removedUrl && !showingOriginal
              ? {
                  backgroundImage:
                    'linear-gradient(45deg, #f5f5f5 25%, transparent 25%), linear-gradient(-45deg, #f5f5f5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f5f5f5 75%), linear-gradient(-45deg, transparent 75%, #f5f5f5 75%)',
                  backgroundSize: '12px 12px',
                  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
                }
              : undefined
          }
        >
          {url ? (
            <Image
              src={url}
              alt="Client logo"
              width={320}
              height={160}
              unoptimized
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
              No logo
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || removing}
              className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-60"
            >
              {uploading || removing ? (
                <>
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  {removing ? 'Removing background…' : 'Uploading…'}
                </>
              ) : (
                <>{url ? 'Replace' : 'Upload'} image</>
              )}
            </button>
            {originalUrl && removedUrl && (
              <button
                type="button"
                onClick={toggleOriginal}
                disabled={uploading || removing}
                className="inline-flex items-center rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-navy-50"
              >
                {showingOriginal ? 'Use cut-out' : 'Use original'}
              </button>
            )}
            {url && (
              <button
                type="button"
                onClick={clear}
                disabled={uploading || removing}
                className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-aegis-gray-500 hover:text-aegis-orange-600"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-aegis-gray-300">
            PNG / JPG / SVG · max 2 MB. Background is auto-removed for raster logos
            against a plain backdrop. Click <em>Use original</em> if the cut-out went
            wrong.
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      <input type="hidden" name={name} value={url ?? ''} />

      {error && (
        <p className="mt-2 text-xs text-aegis-orange-600">{error}</p>
      )}
    </div>
  );
}
