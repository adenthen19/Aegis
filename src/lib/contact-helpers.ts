// Helpers for turning user-entered phone numbers into clickable contact
// links. Centralised so the analyst, media, and event guest views stay in
// sync if we ever change the rules.

// Strip everything that isn't a digit, then promote local Malaysian
// numbers (`0xx-...`) to international format (`60xx-...`) so WhatsApp's
// `wa.me/<digits>` deep link resolves without prompting the user to
// confirm the country.
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) {
    digits = '6' + digits;
  }
  return digits;
}

export function whatsAppUrl(raw: string | null | undefined): string | null {
  const num = toWhatsAppNumber(raw);
  return num ? `https://wa.me/${num}` : null;
}
