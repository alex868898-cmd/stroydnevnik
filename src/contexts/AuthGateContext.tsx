import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../services/supabase';
import { isLocalSecurityEnabled } from '../services/localAuth';
import { authenticateBiometrics, isBiometricEnabled } from '../services/biometricAuth';
import {
  hasPendingPasswordRecovery,
  hasRecentlyHandledPasswordRecovery,
  parsePasswordRecoveryLink,
} from '../services/passwordRecovery';

interface AuthGateContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isLocalLocked: boolean;
  isPasswordRecovery: boolean;
  beginPasswordRecovery: () => void;
  completePasswordRecovery: () => void;
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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const passwordRecoveryRef = React.useRef(false);

  // Initialize session and auth state listener
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          const parsed = parsePasswordRecoveryLink(initialUrl);
          const pendingRecovery = await hasPendingPasswordRecovery();
          const alreadyHandled = parsed.isRecovery
            ? await hasRecentlyHandledPasswordRecovery()
            : false;
          if (!alreadyHandled && (parsed.isRecovery || pendingRecovery)) {
            passwordRecoveryRef.current = true;
            if (!cancelled) {
              setIsPasswordRecovery(true);
              setIsLocalLocked(false);
            }
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        setSession(session);
        setUser(session?.user ?? null);
        if (session && !passwordRecoveryRef.current) {
          checkAndApplyLock();
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Unable to initialize authentication:', error);
        if (!cancelled) setLoading(false);
      }
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (event === 'PASSWORD_RECOVERY') {
        passwordRecoveryRef.current = true;
        setIsPasswordRecovery(true);
        setIsLocalLocked(false);
        setLoading(false);
        return;
      }

      if (session) {
        if (passwordRecoveryRef.current) {
          setIsLocalLocked(false);
          setLoading(false);
        } else {
          checkAndApplyLock();
        }
      } else {
        setIsLocalLocked(false);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Determine if we need to lock the app locally
  const checkAndApplyLock = async () => {
    try {
      if (passwordRecoveryRef.current) {
        setIsLocalLocked(false);
        return;
      }

      const securityEnabled = await isLocalSecurityEnabled();
      if (passwordRecoveryRef.current) {
        setIsLocalLocked(false);
        return;
      }
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

  const beginPasswordRecovery = React.useCallback(() => {
    passwordRecoveryRef.current = true;
    setIsPasswordRecovery(true);
    setIsLocalLocked(false);
    setLoading(false);
  }, []);

  const completePasswordRecovery = React.useCallback(() => {
    passwordRecoveryRef.current = false;
    setIsPasswordRecovery(false);
    setIsLocalLocked(false);
    setLoading(false);
  }, []);

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
    passwordRecoveryRef.current = false;
    setIsPasswordRecovery(false);
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
        isPasswordRecovery,
        beginPasswordRecovery,
        completePasswordRecovery,
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
