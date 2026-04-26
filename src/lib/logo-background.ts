// Client-side logo background removal.
//
// Approach: a logo image is loaded into an OffscreenCanvas. We sample the
// four corners to estimate the background colour, then sweep the bitmap
// setting any pixel whose colour is within a tolerance of the sampled
// background to fully transparent. This is the "white-background JPEG"
// case which covers ~80% of corporate logos handed over by clients.
//
// Limitations (deliberate, asset-light):
//   • Logos on photographic / gradient backgrounds won't look great —
//     there is no foreground-segmentation model running here.
//   • Anti-aliased edges may show a faint halo of the original
//     background colour. For most viewing contexts (small avatars,
//     header chips) this is invisible.
//   • Pixels that match the background but are part of the logo (e.g.
//     a white inner counter on a dark logo) will also become
//     transparent. That's the trade-off for a no-dependency approach.

const TOLERANCE = 28; // 0–255; how close a pixel has to be to count as bg
const FEATHER_TOLERANCE = 60; // looser tolerance for partial-alpha feather

type Rgb = { r: number; g: number; b: number };

function rgbDistance(a: Rgb, b: Rgb): number {
  // Squared euclidean distance in RGB. Cheaper than perceptual but good
  // enough for "is this near-white / near-grey?" checks.
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleCornerAverage(data: Uint8ClampedArray, w: number, h: number): Rgb {
  // Average pixel colour from a small patch in each corner. We skip pixels
  // that are already transparent so that PNGs with existing alpha don't
  // poison the sample.
  const PATCH = 3;
  const points: Array<{ x: number; y: number }> = [];
  for (let dy = 0; dy < PATCH; dy++) {
    for (let dx = 0; dx < PATCH; dx++) {
      points.push({ x: dx, y: dy });
      points.push({ x: w - 1 - dx, y: dy });
      points.push({ x: dx, y: h - 1 - dy });
      points.push({ x: w - 1 - dx, y: h - 1 - dy });
    }
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const p of points) {
    const idx = (p.y * w + p.x) * 4;
    const a = data[idx + 3];
    if (a < 128) continue;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
    n += 1;
  }
  if (n === 0) return { r: 255, g: 255, b: 255 };
  return { r: r / n, g: g / n, b: b / n };
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image.'));
      img.src = url;
    });
  } finally {
    // Revoke after the load resolves; the decoded pixels are now owned by
    // the canvas / image element and don't need the original blob URL.
    URL.revokeObjectURL(url);
  }
}

export type RemoveBackgroundResult =
  | { ok: true; blob: Blob }
  | { ok: false; error: string };

/**
 * Strip the background from a raster image (PNG / JPEG). Returns a new PNG
 * blob with transparency. SVG inputs are returned unchanged because they're
 * vector and likely already authored with a transparent background.
 */
export async function removeLogoBackground(
  file: File | Blob,
  mimeType: string,
): Promise<RemoveBackgroundResult> {
  if (mimeType === 'image/svg+xml') {
    // SVGs are already vector; no pixel-level work to do.
    return { ok: true, blob: file };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Decode failed.' };
  }

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) {
    return { ok: false, error: 'Image has zero dimensions.' };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, error: 'Canvas not available in this browser.' };
  ctx.drawImage(img, 0, 0);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    // Cross-origin source images can taint the canvas. Logos uploaded to our
    // own bucket should be same-origin via the Supabase public URL, but if
    // CORS blocks the read we surface a clear message.
    return {
      ok: false,
      error: 'Could not read pixels (cross-origin). Re-upload the image.',
    };
  }

  const data = imageData.data;
  const bg = sampleCornerAverage(data, w, h);

  // First pass: hard-zero pixels that match the background.
  // Second pass: pixels near the boundary get partial alpha so the edge
  // feathers instead of producing a hard halo.
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const px: Rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const d = rgbDistance(px, bg);
    if (d <= TOLERANCE) {
      data[i + 3] = 0;
    } else if (d <= FEATHER_TOLERANCE) {
      // Linearly fade alpha across the feather zone.
      const t = (d - TOLERANCE) / (FEATHER_TOLERANCE - TOLERANCE);
      data[i + 3] = Math.round(a * t);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) return { ok: false, error: 'Could not encode PNG.' };
  return { ok: true, blob };
}
