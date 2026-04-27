'use client';

/**
 * In-app document viewer. Renders inside a full-height modal so the user can
 * read PDFs, images, and Google Drive embeds without leaving the page or
 * waiting for a download. Falls back to a download button for file types
 * the browser can't render inline (DOCX, XLSX, etc.).
 *
 * The component takes a Document row + a fetcher that returns a usable URL.
 * For Storage files the URL is a 60-second signed link; for external URLs
 * the link is the raw URL. The viewer reshapes Google Drive sharing links
 * into the embeddable `/preview` form so they render cleanly in iframes.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Document } from '@/lib/types';

type ViewMode = 'pdf' | 'image' | 'iframe' | 'download';

function rewriteForEmbed(url: string): { url: string; mode: ViewMode } {
  // Drive: file links — /view, /edit → /preview
  const fileMatch = /^https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/(view|edit)/.exec(url);
  if (fileMatch) {
    return { url: `https://drive.google.com/file/d/${fileMatch[1]}/preview`, mode: 'iframe' };
  }
  // Drive: open?id= short links — same shape
  const openMatch = /^https:\/\/drive\.google\.com\/open\?id=([^&]+)/.exec(url);
  if (openMatch) {
    return { url: `https://drive.google.com/file/d/${openMatch[1]}/preview`, mode: 'iframe' };
  }
  // Google Docs / Sheets / Slides — /edit → /preview
  const docsMatch = /^(https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/[^/]+)\/edit/.exec(url);
  if (docsMatch) {
    return { url: `${docsMatch[1]}/preview`, mode: 'iframe' };
  }
  return { url, mode: 'iframe' };
}

function pickMode(doc: Document): ViewMode {
  // External link — try to embed Drive / Docs; otherwise download/open out.
  if (doc.external_url) {
    const lower = doc.external_url.toLowerCase();
    if (
      lower.includes('drive.google.com') ||
      lower.includes('docs.google.com')
    ) {
      return 'iframe';
    }
    // Direct file URLs ending in known extensions can still render.
    if (/\.pdf(\?|#|$)/i.test(lower)) return 'pdf';
    if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(lower)) return 'image';
    return 'download';
  }
  // Uploaded file — switch on MIME.
  const mime = (doc.mime_type ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'download';
}

export default function DocumentViewer({
  open,
  onClose,
  document,
  fetchUrl,
}: {
  open: boolean;
  onClose: () => void;
  document: Document | null;
  fetchUrl: (
    documentId: string,
  ) => Promise<{ ok: boolean; url: string | null; error: string | null }>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mode: ViewMode = useMemo(
    () => (document ? pickMode(document) : 'download'),
    [document],
  );

  useEffect(() => {
    if (!open || !document) {
      setUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUrl(document.document_id).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok || !r.url) {
        setError(r.error ?? 'Could not load the document.');
        return;
      }
      // Rewrite Google links into embeddable form.
      if (mode === 'iframe') {
        setUrl(rewriteForEmbed(r.url).url);
      } else {
        setUrl(r.url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, document, fetchUrl, mode]);

  // ESC + body-scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !document) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center sm:p-4">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-aegis-navy/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="docviewer-title"
        className="relative z-10 flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl sm:rounded-xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-aegis-gray-100 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id="docviewer-title" className="truncate text-sm font-semibold text-aegis-navy">
              {document.name}
            </h2>
            <p className="mt-0.5 text-[11px] text-aegis-gray-500">
              {document.mime_type ?? (document.external_url ? 'External link' : 'Document')}
              {document.size_bytes != null && (
                <span className="ml-2 tabular-nums">{formatBytes(document.size_bytes)}</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-aegis-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-8 8" />
                  <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                </svg>
                Open in new tab
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-aegis-gray-500 hover:bg-aegis-gray-100 hover:text-aegis-gray"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        </header>

        <div className="aegis-scroll flex-1 overflow-auto bg-aegis-gray-50">
          {loading && (
            <div className="flex h-full items-center justify-center text-xs text-aegis-gray-500">
              Loading…
            </div>
          )}
          {!loading && error && (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-aegis-orange-600">
              {error}
            </div>
          )}
          {!loading && !error && url && (
            <ViewerBody mode={mode} url={url} alt={document.name} />
          )}
        </div>
      </div>
    </div>
  );
}

function ViewerBody({ mode, url, alt }: { mode: ViewMode; url: string; alt: string }) {
  if (mode === 'pdf') {
    return (
      <iframe
        title={alt}
        src={url}
        className="h-full w-full border-0"
      />
    );
  }
  if (mode === 'iframe') {
    return (
      <iframe
        title={alt}
        src={url}
        className="h-full w-full border-0"
        // Drive's /preview uses sandbox-friendly embedding.
        allow="autoplay"
      />
    );
  }
  if (mode === 'image') {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }
  // download fallback
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <svg className="h-10 w-10 text-aegis-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <p className="text-sm text-aegis-gray">
        This document type can&apos;t be previewed in the browser.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md bg-aegis-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-aegis-orange-600"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v12M6 12l6 6 6-6M4 20h16" />
        </svg>
        Download
      </a>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
