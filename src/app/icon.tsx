import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Static PNG dimensions — the source is the full lock-up (triangle + wordmark)
// at 1346 × 513. The triangle mark itself sits roughly at x=120..540,
// y=20..500. At favicon sizes the wordmark is unreadable, so we render the
// image scaled and translated so only the triangle is visible inside the
// square frame.

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default async function Icon() {
  const buffer = await readFile(
    path.join(process.cwd(), 'public', 'aegis_logo.png'),
  );
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

  // The triangle and the "egis" wordmark are too close in the source for a
  // single-box overflow clip to drop the wordmark cleanly. So we use a
  // nested box: an outer 64×64 white frame, and an inner 56-wide clip box
  // sized exactly to the triangle. Image rendered at 180 × 68 (scale 0.134
  // of source), shifted -16px so triangle x=16..72 sits flush at inner
  // x=0..56 — wordmark x≥73 is clipped by overflow:hidden.
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <div
          style={{
            width: 56,
            height: 64,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            width={180}
            height={68}
            alt=""
            style={{ marginLeft: -16, marginTop: -2, flexShrink: 0 }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
