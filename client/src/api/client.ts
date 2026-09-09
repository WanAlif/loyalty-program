import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // required to send/receive the httpOnly JWT cookie
});

// Custom event fired whenever an authenticated request comes back 401 —
// i.e. the session cookie is missing/expired. AuthContext listens for this
// and clears the logged-in user, which sends the app back to /login via
// ProtectedRoute instead of leaving a raw error banner on screen.
export const SESSION_EXPIRED_EVENT = 'session-expired';

// Requests where a 401 is an *expected*, self-handled outcome (wrong
// login credentials, or the initial /auth/me check before any login has
// happened) rather than a genuinely expired session — these should NOT
// trigger the global redirect.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/me', '/auth/logout'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url || '';
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => url.includes(path));

    if (status === 401 && !isAuthEndpoint) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }

    return Promise.reject(error);
  }
);

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
