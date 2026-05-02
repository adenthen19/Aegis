// Display-time normalisation for user-typed text. We never rewrite the
// stored values — just clean them up when rendering, so a contact entered
// as "JOHN TAN" surfaces as "John Tan" without losing the original on the
// way back into the DB.
//
// Three pillars:
//   • displayName / displayCompany — smart Title Case
//   • displayPhone                 — international format with grouping
//   • displayEmail                 — lowercase + trim
//
// All helpers tolerate null / undefined / empty input and return ''.

// ─────────────────────────────────────────────────────────────────────────
// Names & companies — smart Title Case
// ─────────────────────────────────────────────────────────────────────────
//
// Rules (in order):
//   1. Empty / whitespace-only → ''.
//   2. ALL UPPERCASE input → re-cast to Title Case (capitalize first letter
//      of every word). User wasn't being deliberate; pretty it up.
//   3. Otherwise — per-word:
//        • All-lowercase word          → Capitalised
//        • All-uppercase short word    → preserved (acronym: RHB, KPMG)
//        • Mixed case                  → preserved (iPhone, MacKenzie)
//   4. Apostrophes split words too, so "o'brien" → "O'Brien" and
//      "dato' sri abu" → "Dato' Sri Abu".

// Tokens we use to split words while keeping separators intact for join().
// Apostrophes count as splitters so "O'Brien" gets capitalised on both sides.
const NAME_TOKEN_RE = /(\s+|-|')/;

function isAllCaps(s: string): boolean {
  return /[A-Z]/.test(s) && s.toUpperCase() === s;
}

function capitalizeFirst(token: string): string {
  if (!token) return token;
  return token[0].toUpperCase() + token.slice(1);
}

function titleCaseToken(token: string): string {
  if (!token) return token;
  if (NAME_TOKEN_RE.test(token) && token.length === 1 || /^\s+$/.test(token)) {
    return token;
  }
  // Word — decide based on its current case.
  const hasLower = /[a-z]/.test(token);
  const hasUpper = /[A-Z]/.test(token);

  // Mixed case → preserve (iPhone, MacKenzie, eBay)
  if (hasLower && hasUpper) return token;

  // All-caps acronym (≤ 5 chars) sat inside a non-all-caps name → preserve
  if (hasUpper && !hasLower && token.length <= 5) return token;

  // All-lowercase or longer all-caps word → capitalise the first letter
  return capitalizeFirst(token.toLowerCase());
}

export function displayName(s: string | null | undefined): string {
  if (!s) return '';
  const trimmed = s.trim();
  if (!trimmed) return '';

  if (isAllCaps(trimmed)) {
    // Whole string is shouting — just title case everything, no acronym
    // preservation since the user clearly wasn't being deliberate.
    return trimmed
      .toLowerCase()
      .split(NAME_TOKEN_RE)
      .map((token) => {
        if (/^\s+$/.test(token) || token === '-' || token === "'") return token;
        return capitalizeFirst(token);
      })
      .join('');
  }

  return trimmed
    .split(NAME_TOKEN_RE)
    .map((token) => {
      if (/^\s+$/.test(token) || token === '-' || token === "'") return token;
      return titleCaseToken(token);
    })
    .join('');
}

// Companies follow the same rules as names — RHB, KPMG, IBM are preserved
// when they sit inside a mixed-case input, but a wholly-shouting input is
// Title Cased.
export const displayCompany = displayName;

// ─────────────────────────────────────────────────────────────────────────
// Phone numbers — international format with grouping
// ─────────────────────────────────────────────────────────────────────────
//
// Display rules:
//   • Local Malaysian (`0xx-xxx xxxx` or `0xx-xxxx xxxx`) → promote to
//     international (`60xx xxx xxxx` or `60xx xxxx xxxx`).
//   • Already-international `60` → grouped 4-3-4 (or 4-4-4 for 11-digit
//     subscriber lines).
//   • Singapore `65` → `65 xxxx xxxx` (8-digit subscriber).
//   • Unknown country code / odd lengths → fall back to a sane chunked
//     format so we don't spit raw digits at the user.
//
// The helper for WhatsApp deep links lives in `contact-helpers.ts` and
// uses the same digit-extraction rules — keep them in sync.

export function displayPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const original = raw.trim();
  if (!original) return '';

  let digits = original.replace(/\D/g, '');
  if (!digits) return original;

  // Promote local Malaysian numbers (10 or 11 digits starting with 0) to
  // international form so display is consistent regardless of how the user
  // entered it.
  if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) {
    digits = '6' + digits;
  }

  // Malaysia
  if (digits.startsWith('60')) {
    const sub = digits.slice(2);
    if (sub.length === 9) {
      // 60 + 9 → 60xx xxx xxxx
      return `60${sub.slice(0, 2)} ${sub.slice(2, 5)} ${sub.slice(5)}`;
    }
    if (sub.length === 10) {
      // 60 + 10 → 60xx xxxx xxxx
      return `60${sub.slice(0, 2)} ${sub.slice(2, 6)} ${sub.slice(6)}`;
    }
    if (sub.length === 8) {
      // Landline, e.g. KL: 03 xxxx xxxx → 60 3 xxxx xxxx
      return `60${sub.slice(0, 1)} ${sub.slice(1, 5)} ${sub.slice(5)}`;
    }
  }

  // Singapore
  if (digits.startsWith('65') && digits.length === 10) {
    // 65 + 8 → 65 xxxx xxxx
    return `65 ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }

  // Unknown country code — chunk the tail in groups of 4 for readability.
  // Try to detect a 1-3 digit country code by leaving the first 1-2 digits
  // alone; this is a heuristic but better than dumping a 12-digit string.
  if (digits.length >= 9) {
    const cc = digits.slice(0, 2);
    const rest = digits.slice(2);
    return `${cc} ${rest.replace(/(\d{4})(?=\d)/g, '$1 ').trim()}`;
  }

  return digits;
}

// ─────────────────────────────────────────────────────────────────────────
// Email — case-insensitive in practice, so always render lowercase.
// ─────────────────────────────────────────────────────────────────────────

export function displayEmail(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().toLowerCase();
}
