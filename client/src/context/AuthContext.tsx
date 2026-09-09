import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, SESSION_EXPIRED_EVENT, type User } from '../api/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  sessionMessage: string | null;
  clearSessionMessage: () => void;
  login: (identifier: string, password: string) => Promise<User>;
  adminLogin: (identifier: string, password: string) => Promise<User>;
  register: (data: { name: string; email?: string; phone?: string; password: string }) => Promise<void>;
  updateProfile: (data: { name: string; email?: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    // On first load, check if a valid session cookie already exists.
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Fired by the axios interceptor in api/client.ts whenever an
    // authenticated request comes back 401 (expired/invalid session
    // cookie). Clearing `user` here sends the app back to /login via
    // ProtectedRoute, instead of leaving pages stuck showing a raw
    // "Not authenticated" error banner.
    function handleSessionExpired() {
      setUser((current) => {
        if (current) {
          setSessionMessage('Your session has expired. Please log in again.');
        }
        return null;
      });
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  async function login(identifier: string, password: string) {
    const res = await api.post('/auth/login', { identifier, password });
    setUser(res.data.user);
    setSessionMessage(null);
    return res.data.user as User;
  }

  async function adminLogin(identifier: string, password: string) {
    const res = await api.post('/auth/admin-login', { identifier, password });
    setUser(res.data.user);
    setSessionMessage(null);
    return res.data.user as User;
  }

  async function register(data: { name: string; email?: string; phone?: string; password: string }) {
    const res = await api.post('/auth/register', data);
    setUser(res.data.user);
    setSessionMessage(null);
  }

  async function updateProfile(data: { name: string; email?: string; phone?: string }) {
    const res = await api.patch('/auth/me', data);
    setUser(res.data.user);
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }

  function clearSessionMessage() {
    setSessionMessage(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionMessage, clearSessionMessage, login, adminLogin, register, updateProfile, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
