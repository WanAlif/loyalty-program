import crypto from 'crypto';

// Business rule (documented assumption — brief didn't specify an exact
// reward formula): voucher value is 10% of the approved receipt amount,
// and vouchers expire 90 days after issuance.
export const VOUCHER_REWARD_PERCENTAGE = 0.1;
export const VOUCHER_VALIDITY_DAYS = 90;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes ambiguous chars (0/O, 1/I)

export function generateVoucherCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return `LP-${code}`;
}

export function calculateVoucherAmount(receiptAmount: number): number {
  return Math.round(receiptAmount * VOUCHER_REWARD_PERCENTAGE * 100) / 100;
}

export function calculateExpiryDate(from: Date = new Date()): Date {
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + VOUCHER_VALIDITY_DAYS);
  return expiry;
}
