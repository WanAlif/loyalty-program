import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // required to send/receive the httpOnly JWT cookie
});

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'USER' | 'ADMIN';
}

export interface Voucher {
  id: string;
  code: string;
  amount: string;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  receipt?: { orderId: string; amount: string };
}

export interface Receipt {
  id: string;
  orderId: string;
  purchaseDate: string;
  amount: string;
  fileUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  user?: { id: string; name: string; email: string | null; phone: string | null };
  voucher?: Voucher | null;
}

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.data?.error) {
    return err.response.data.error as string;
  }
  return 'Something went wrong. Please try again.';
}
