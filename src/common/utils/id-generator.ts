/**
 * Deterministic, human-readable ID generators matching the spec examples.
 */

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** e.g. USR-0001 */
export function userId(seq: number): string {
  return `USR-${pad(seq, 4)}`;
}

/** e.g. LN-2026-0001 (uses the current year). */
export function loanId(seq: number, date = new Date()): string {
  return `LN-${date.getFullYear()}-${pad(seq, 4)}`;
}

/** e.g. ACC-2026-0001 (uses the current year). */
export function accountId(seq: number, date = new Date()): string {
  return `ACC-${date.getFullYear()}-${pad(seq, 4)}`;
}

/** e.g. PAY-000123 (universally unique, not year-scoped). */
export function paymentId(seq: number): string {
  return `PAY-${pad(seq, 6)}`;
}

/** e.g. CSLN-2026-0001 */
export function consultancyId(seq: number, date = new Date()): string {
  return `CSLN-${date.getFullYear()}-${pad(seq, 4)}`;
}

/** e.g. SMS-0001 */
export function smsLogId(seq: number): string {
  return `SMS-${pad(seq, 4)}`;
}

/** Short random suffix for file-based document ids. */
export function randomSuffix(length = 6): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/** Generate account number for customers */
export function generateAccountNumber(): string {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ACC-${random}`;
}
