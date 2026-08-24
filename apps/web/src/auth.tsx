import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
  address?: string;
  city?: string;
  emergencyContact?: string;
  memberNumber?: string;
  company?: { id: string; name: string; status: string } | null;
  unreadNotifications?: number;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  login: (email: string, password: string) => Promise<Me>;
  register: (dto: Record<string, unknown>) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<Me | null> => {
    if (!getToken()) {
      setMe(null);
      return null;
    }
    try {
      const user = await api.get<Me>('/auth/me');
      setMe(user);
      return user;
    } catch {
      setToken(null);
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: Me }>('/auth/login', { email, password });
    setToken(res.accessToken);
    const full = await refresh();
    return full ?? res.user;
  }, [refresh]);

  const register = useCallback(async (dto: Record<string, unknown>) => {
    await api.post('/auth/register', dto);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ me, loading, refresh, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  INSURANCE_MANAGER: '/admin',
  SUPPORT_AGENT: '/admin/claims',
  COMPANY_ADMIN: '/entreprise',
  MEMBER: '/app',
  PROVIDER: '/prestataire',
};
