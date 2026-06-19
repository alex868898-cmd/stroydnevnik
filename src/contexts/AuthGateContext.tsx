import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { isLocalSecurityEnabled } from '../services/localAuth';
import { authenticateBiometrics, isBiometricEnabled } from '../services/biometricAuth';

interface AuthGateContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isLocalLocked: boolean;
  unlockLocal: () => void;
  lockLocal: () => void;
  signOut: () => Promise<void>;
  checkLocalSecurity: () => Promise<boolean>;
}

const AuthGateContext = createContext<AuthGateContextType | undefined>(undefined);

export const AuthGateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocalLocked, setIsLocalLocked] = useState(false);

  // Initialize session and auth state listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        checkAndApplyLock();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        checkAndApplyLock();
      } else {
        setIsLocalLocked(false);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Determine if we need to lock the app locally
  const checkAndApplyLock = async () => {
    try {
      const securityEnabled = await isLocalSecurityEnabled();
      if (securityEnabled) {
        setIsLocalLocked(true);
        // Attempt automatic biometric prompt if enabled
        const bioEnabled = await isBiometricEnabled();
        if (bioEnabled) {
          const success = await authenticateBiometrics();
          if (success) {
            setIsLocalLocked(false);
          }
        }
      } else {
        setIsLocalLocked(false);
      }
    } catch (e) {
      console.error('Error checking local security lock:', e);
    } finally {
      setLoading(false);
    }
  };

  const checkLocalSecurity = async (): Promise<boolean> => {
    return await isLocalSecurityEnabled();
  };

  const unlockLocal = () => {
    setIsLocalLocked(false);
  };

  const lockLocal = async () => {
    const securityEnabled = await isLocalSecurityEnabled();
    if (securityEnabled) {
      setIsLocalLocked(true);
    }
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setIsLocalLocked(false);
    setLoading(false);
  };

  return (
    <AuthGateContext.Provider
      value={{
        user,
        session,
        loading,
        isLocalLocked,
        unlockLocal,
        lockLocal,
        signOut,
        checkLocalSecurity,
      }}
    >
      {children}
    </AuthGateContext.Provider>
  );
};

export const useAuthGate = () => {
  const context = useContext(AuthGateContext);
  if (context === undefined) {
    throw new Error('useAuthGate must be used within an AuthGateProvider');
  }
  return context;
};
