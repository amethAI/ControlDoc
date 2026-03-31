import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'Administrador' | 'Supervisora' | 'Coordinadora' | 'Supervisor Interno' | 'Supervisor Cliente';
  club_id?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const clearSession = () => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (_) {}
  };

  const isTokenExpired = (token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  };

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      if (storedToken && storedUser) {
        // M-5: Validate token expiry client-side before using it
        if (isTokenExpired(storedToken)) {
          clearSession();
          return;
        }
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));

          // A-2: Validate res.ok before trusting response
          fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          })
          .then(res => {
            if (!res.ok) {
              clearSession();
              return null;
            }
            return res.json();
          })
          .then(data => {
            if (data?.user) {
              setUser(data.user);
              localStorage.setItem('user', JSON.stringify(data.user));
            }
          })
          .catch(() => clearSession());
        } catch (e) {
          clearSession();
        }
      }
    } catch (e) {
      console.warn('localStorage not available', e);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    try {
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
    } catch (e) {
      console.warn('localStorage not available', e);
    }
  };

  const logout = () => {
    clearSession();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
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
