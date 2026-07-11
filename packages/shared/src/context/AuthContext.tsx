import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '../services/api';
import { consumeAuthTokenFromUrl } from '../config';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: {
    email: string;
    password: string;
    name?: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      const handedOff = consumeAuthTokenFromUrl();
      if (handedOff) {
        localStorage.setItem('token', handedOff);
      }
      const token = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          localStorage.removeItem('user');
        }
      }
      if (token) {
        try {
          const res = await apiService.getCurrentUser();
          if (res.user) {
            setUser(res.user);
            localStorage.setItem('user', JSON.stringify(res.user));
          }
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };
    boot();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await apiService.login({ email, password });
      if (!res.token || !res.user) return false;
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      setUser(res.user);
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    name?: string;
    firstName?: string;
    lastName?: string;
  }) => {
    try {
      const res = await apiService.register(data);
      if (!res.token || !res.user) {
        return {
          ok: false,
          error:
            typeof res.error === 'string'
              ? res.error
              : (res.error as any)?.message || 'Kayıt başarısız',
        };
      }
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      setUser(res.user);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Kayıt başarısız' };
    }
  };

  const logout = () => {
    apiService.logout().catch(() => undefined);
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
