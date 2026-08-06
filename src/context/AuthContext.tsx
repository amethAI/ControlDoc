import React, { createContext, useContext, useState, useEffect } from 'react';
import { DEFAULTS, type LocaleConfig } from '../lib/locale';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'Super Administrador' | 'Administrador' | 'Supervisora' | 'Supervisora Redvolution' | 'Coordinadora' | 'Supervisor Interno' | 'Supervisor Cliente' | 'Recursos Humanos' | 'Asistente RRHH';
  club_id?: string;
  country?: string;
  club_locale?: string;
  club_timezone?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data?.user) setUser(data.user); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handle = () => {
      setUser(null);
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    };
    window.addEventListener('auth:expired', handle);
    return () => window.removeEventListener('auth:expired', handle);
  }, []);

  const login = (_token: string, newUser: User) => {
    setUser(newUser);
  };

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token: null, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Returns the locale/timezone for the authenticated user's club.
 * Falls back to system defaults from VITE_APP_LOCALE / VITE_APP_TIMEZONE env vars.
 * Use this everywhere instead of hardcoding 'es-PA' or 'America/Panama'.
 */
export const useLocale = (): LocaleConfig => {
  const { user } = useAuth();
  return {
    locale:   user?.club_locale   ?? DEFAULTS.locale,
    timezone: user?.club_timezone ?? DEFAULTS.timezone,
  };
};
