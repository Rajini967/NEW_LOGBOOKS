import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { authAPI } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState<number | null>(null);

  const loadSessionSettings = useCallback(async () => {
    try {
      const settings = await authAPI.getSessionSettings();
      if (typeof settings.auto_logout_minutes === 'number') {
        setAutoLogoutMinutes(settings.auto_logout_minutes);
      }
    } catch (error) {
      console.error('Failed to load session settings:', error);
    }
  }, []);

  // Check if user is already logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const userData = await authAPI.getCurrentUser();
          // Map backend role 'client' to frontend 'customer' for compatibility
          const mappedUser: User = {
            ...userData,
            role: userData.role === 'client' ? 'customer' : (userData.role as UserRole),
          };
          setUser(mappedUser);
          await loadSessionSettings();
        } catch (error) {
          // Token invalid, clear it
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [loadSessionSettings]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      await authAPI.login(email, password);
      
      // Fetch user details after successful login
      const userData = await authAPI.getCurrentUser();
      
      // Map backend role 'client' to frontend 'customer' for compatibility
      const mappedUser: User = {
        ...userData,
        role: userData.role === 'client' ? 'customer' : (userData.role as UserRole),
      };
      
      setUser(mappedUser);
      await loadSessionSettings();
      return true;
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await authAPI.getCurrentUser();
      const mappedUser: User = {
        ...userData,
        role: userData.role === 'client' ? 'customer' : (userData.role as UserRole),
      };
      setUser(mappedUser);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, []);

  // Inactivity-based auto logout using configured timeout
  useEffect(() => {
    if (!user || !autoLogoutMinutes || autoLogoutMinutes <= 0) {
      return;
    }

    const timeoutMs = autoLogoutMinutes * 60 * 1000;
    const activityEvents: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll'];
    let timeoutId: number | undefined;

    const triggerAutoLogout = async () => {
      try {
        await authAPI.logout('auto');
      } catch (error) {
        console.error('Auto logout error:', error);
      } finally {
        setUser(null);
      }
    };

    const resetTimer = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(triggerAutoLogout, timeoutMs);
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer);
    });

    // Start timer immediately
    resetTimer();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
    };
  }, [user, autoLogoutMinutes]);

  const switchRole = useCallback((role: UserRole) => {
    if (user) {
      setUser({ ...user, role });
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, switchRole, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
