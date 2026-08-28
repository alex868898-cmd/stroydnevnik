import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import { AuthGateProvider, useAuthGate } from '../contexts/AuthGateContext';
import { PinEntry } from '../components/auth/PinEntry';
import { COLORS } from '../lib/constants';
import { syncReminderSchedules } from '../services/notifications';
import { supabase } from '../services/supabase';

function RootLayoutContent() {
  const { session, loading, isLocalLocked, unlockLocal, signOut } = useAuthGate();
  const segments = useSegments();
  const router = useRouter();
  const url = Linking.useURL();

  // Deep Link Handling for email confirmation / oauth redirects
  useEffect(() => {
    const handleDeepLink = async (openedUrl: string) => {
      try {
        console.log('Opened app via deep link:', openedUrl);
        
        // 1. Try legacy getSessionFromUrl if it exists on the auth client
        if (typeof (supabase.auth as any).getSessionFromUrl === 'function') {
          const { error } = await (supabase.auth as any).getSessionFromUrl({ storeSession: true });
          if (!error) {
            console.log('Successfully handled deep link session using getSessionFromUrl');
            return;
          }
        }

        // 2. Fallback: Parse URL manually and call setSession
        const params: Record<string, string> = {};
        const hashIdx = openedUrl.indexOf('#');
        const queryIdx = openedUrl.indexOf('?');
        const startIdx = hashIdx !== -1 ? hashIdx : queryIdx;
        
        if (startIdx !== -1) {
          const paramString = openedUrl.substring(startIdx + 1);
          const pairs = paramString.split('&');
          for (const pair of pairs) {
            const [key, value] = pair.split('=');
            if (key && value) {
              params[decodeURIComponent(key)] = decodeURIComponent(value);
            }
          }
        }

        const { access_token, refresh_token } = params;

        if (access_token && refresh_token) {
          console.log('Found session tokens in deep link, updating session manually...');
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            console.error('Error setting session from deep link:', error);
          } else {
            console.log('Session successfully set from deep link. Logged in as:', data.user?.email);
          }
        }
      } catch (err) {
        console.error('Error in deep link processing:', err);
      }
    };

    if (url) {
      handleDeepLink(url);
    }
  }, [url]);

  // Redirect logic based on Supabase session state
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      // No active session -> go to login
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (!isLocalLocked) {
      // Session exists & local security unlocked -> go to main app
      if (inAuthGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [session, loading, isLocalLocked, segments]);

  // Sync scheduled push reminders on login
  useEffect(() => {
    if (session && !isLocalLocked) {
      syncReminderSchedules().catch(e => console.error('Error syncing notifications:', e));
    }
  }, [session, isLocalLocked]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Local Security Gate: PIN/Biometric lock screen overlay
  if (session && isLocalLocked) {
    return (
      <View style={styles.lockContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <PinEntry 
          onSuccess={unlockLocal} 
          onAlternativeAuth={signOut} // Fallback: sign out and input email/pass
          title="Заблоковано. Введіть PIN-код"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Slot />
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthGateProvider>
      <RootLayoutContent />
    </AuthGateProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
