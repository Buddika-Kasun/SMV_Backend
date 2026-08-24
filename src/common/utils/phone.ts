/**
 * Sri Lankan phone number normalisation.
 * Normalises local numbers (e.g. 0771234567, 771234567) to the E.164
 * international format with a +94 prefix required by the SMS gateway.
 */
export function normalizeSriLankanPhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits) return input;
  if (digits.startsWith('94')) return `+${digits}`;
  if (digits.startsWith('0')) return `+94${digits.slice(1)}`;
  return `+94${digits}`;
}

/** Keep only the local digits (e.g. 0771234567) stripped of +94. */
export function localSriLankanPhone(input: string): string {
  const normalized = normalizeSriLankanPhone(input);
  return normalized.replace(/^\+94/, '0');
}

/** Convert a user-supplied message into the expected Text.lk recipient (94...). */
export function smsRecipient(input: string): string {
  return normalizeSriLankanPhone(input).replace(/^\+/, '');
}