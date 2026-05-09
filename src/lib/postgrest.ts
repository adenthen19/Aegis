// Helpers for safely interpolating user input into PostgREST queries.
//
// PostgREST `.or()` syntax uses commas as condition separators and
// parentheses as grouping. A user query containing those characters
// either causes a 400 ("invalid query") or — worse — broadens the filter
// in unintended ways by injecting a new clause. We strip the unsafe set
// from any term before interpolation.
//
// We deliberately leave `%` and `_` alone: those are ilike wildcards.
// Stripping them would break valid searches like "100%" or "co_". The
// downside is a search containing a wildcard returns more rows than the
// user typed literally — acceptable for an internal search box.

const PG_OR_UNSAFE_CHARS = /[(),*:\\"]/g;

/**
 * Strip characters that have meaning inside PostgREST `.or()` filters.
 * Returns an empty string for null/undefined/whitespace-only input so
 * callers can short-circuit on `!safeTerm`.
 */
export function sanitizeIlikeTerm(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(PG_OR_UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
}
