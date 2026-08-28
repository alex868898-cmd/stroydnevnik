import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar, Alert, Linking as NativeLinking, Platform } from 'react-native';
import { Href, Slot, usePathname, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import { AuthGateProvider, useAuthGate } from '../contexts/AuthGateContext';
import { PinEntry } from '../components/auth/PinEntry';
import { COLORS } from '../lib/constants';
import { syncReminderSchedules } from '../services/notifications';
import { supabase } from '../services/supabase';
import { requestMicrophonePermission } from '../services/microphonePermission';

function RootLayoutContent() {
  const {
    session,
    loading,
    isLocalLocked,
    isPasswordRecovery,
    beginPasswordRecovery,
    unlockLocal,
    signOut,
  } = useAuthGate();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const url = Linking.useURL();
  const microphonePromptStarted = useRef(false);

  // Ask for microphone access as soon as the application has finished loading.
  // If Android no longer allows the system prompt, direct the user to App settings.
  useEffect(() => {
    if (loading || Platform.OS === 'web' || microphonePromptStarted.current) return;

    const timer = setTimeout(async () => {
      if (microphonePromptStarted.current) return;
      microphonePromptStarted.current = true;

      try {
        const permission = await requestMicrophonePermission();
        if (permission === 'granted') return;

        Alert.alert(
          'Потрібен доступ до мікрофона',
          permission === 'blocked'
            ? 'Android більше не показує системний запит для KOSHTOR. Відкрийте налаштування застосунку та увімкніть «Мікрофон».'
            : 'Ви не надали доступ до мікрофона. Натисніть кнопку мікрофона в журналі, щоб повторити системний запит.',
          [
            { text: 'Пізніше', style: 'cancel' },
            { text: 'Відкрити налаштування', onPress: () => NativeLinking.openSettings() },
          ],
        );
      } catch (error) {
        console.error('Unable to request microphone permission on startup:', error);
        Alert.alert(
          'Не вдалося запросити доступ',
          'Відкрийте налаштування KOSHTOR і дозвольте використання мікрофона.',
          [
            { text: 'Закрити', style: 'cancel' },
            { text: 'Відкрити налаштування', onPress: () => NativeLinking.openSettings() },
          ],
        );
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [loading]);

  // Deep Link Handling for email confirmation / oauth redirects
  useEffect(() => {
    const handleDeepLink = async (openedUrl: string) => {
      try {
        console.log('Opened app via deep link:', openedUrl);

        // Supabase may return auth values in the query string (PKCE) or hash
        // fragment (implicit flow), depending on platform and configuration.
        const params: Record<string, string> = {};
        const hashIdx = openedUrl.indexOf('#');
        const queryIdx = openedUrl.indexOf('?');

        const readParams = (paramString: string) => {
          const pairs = paramString.split('&');
          for (const pair of pairs) {
            const [key, value] = pair.split('=');
            if (key && value) {
              params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
            }
          }
        };

        if (queryIdx !== -1) {
          readParams(openedUrl.slice(queryIdx + 1, hashIdx === -1 ? undefined : hashIdx));
        }
        if (hashIdx !== -1) {
          readParams(openedUrl.slice(hashIdx + 1));
        }

        const { access_token, refresh_token, type, code } = params;

        if (type === 'recovery') {
          beginPasswordRecovery();
        }

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
        } else if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('Error exchanging auth code from deep link:', error);
          } else {
            console.log('Session successfully exchanged from deep link. Logged in as:', data.user?.email);
          }
        }
      } catch (err) {
        console.error('Error in deep link processing:', err);
      }
    };

    if (url) {
      handleDeepLink(url);
    }
  }, [url, beginPasswordRecovery]);

  // Redirect logic based on Supabase session state
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onResetPasswordScreen = pathname === '/reset-password';

    if (isPasswordRecovery) {
      if (!onResetPasswordScreen) {
        router.replace('/reset-password' as Href);
      }
      return;
    }

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
  }, [session, loading, isLocalLocked, isPasswordRecovery, segments, pathname, router]);

  // Sync scheduled push reminders on login
  useEffect(() => {
    if (session && !isLocalLocked && !isPasswordRecovery) {
      syncReminderSchedules().catch(e => console.error('Error syncing notifications:', e));
    }
  }, [session, isLocalLocked, isPasswordRecovery]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Local Security Gate: PIN/Biometric lock screen overlay
  if (session && isLocalLocked && !isPasswordRecovery) {
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
