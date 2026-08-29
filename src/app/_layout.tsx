import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar, Alert, Linking as NativeLinking, Platform } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import { AuthGateProvider, useAuthGate } from '../contexts/AuthGateContext';
import { PinEntry } from '../components/auth/PinEntry';
import { COLORS } from '../lib/constants';
import { syncReminderSchedules } from '../services/notifications';
import { supabase } from '../services/supabase';
import { requestMicrophonePermission } from '../services/microphonePermission';
import { PasswordReset } from '../components/auth/PasswordReset';
import {
  hasPendingPasswordRecovery,
  parsePasswordRecoveryLink,
} from '../services/passwordRecovery';

function RootLayoutContent() {
  const {
    session,
    loading,
    isLocalLocked,
    isPasswordRecovery,
    beginPasswordRecovery,
    completePasswordRecovery,
    unlockLocal,
    signOut,
  } = useAuthGate();
  const segments = useSegments();
  const router = useRouter();
  const url = Linking.useLinkingURL();
  const microphonePromptStarted = useRef(false);
  const handledUrl = useRef<string | null>(null);
  const [recoveryLinkLoading, setRecoveryLinkLoading] = React.useState(false);
  const [recoveryLinkError, setRecoveryLinkError] = React.useState<string | null>(null);

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

  // Deep-link handling for email confirmation and password recovery.
  useEffect(() => {
    const handleDeepLink = async (openedUrl: string) => {
      try {
        const parsed = parsePasswordRecoveryLink(openedUrl);
        const pendingRecovery = await hasPendingPasswordRecovery();
        const shouldRecover = parsed.isRecovery || pendingRecovery;

        if (shouldRecover) {
          beginPasswordRecovery();
          setRecoveryLinkLoading(true);
          setRecoveryLinkError(null);
        }

        if (parsed.error) {
          if (shouldRecover) {
            setRecoveryLinkError('Посилання недійсне або застаріло. Запросіть новий лист.');
          }
          return;
        }

        if (parsed.accessToken && parsed.refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });

          if (error) {
            if (shouldRecover) {
              setRecoveryLinkError('Не вдалося перевірити посилання. Запросіть новий лист.');
            }
            return;
          }

          if (!data.session && shouldRecover) {
            setRecoveryLinkError('Посилання не створило сеанс відновлення. Запросіть новий лист.');
          }
        } else if (parsed.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error || (!data.session && shouldRecover)) {
            if (shouldRecover) {
              setRecoveryLinkError('Не вдалося перевірити посилання. Запросіть новий лист.');
            }
            return;
          }
        } else if (shouldRecover) {
          setRecoveryLinkError('У посиланні немає даних для відновлення. Запросіть новий лист.');
        }
      } catch (err) {
        console.error('Error in deep link processing:', err);
        setRecoveryLinkError('Не вдалося обробити посилання. Запросіть новий лист.');
      } finally {
        setRecoveryLinkLoading(false);
      }
    };

    if (url && handledUrl.current !== url) {
      handledUrl.current = url;
      handleDeepLink(url);
    }
  }, [url, beginPasswordRecovery]);

  const finishPasswordRecovery = React.useCallback(() => {
    completePasswordRecovery();
    setRecoveryLinkError(null);
    setRecoveryLinkLoading(false);
    router.replace('/(auth)/login');
  }, [completePasswordRecovery, router]);

  // Redirect logic based on Supabase session state
  useEffect(() => {
    if (loading) return;

    if (isPasswordRecovery) return;

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
  }, [session, loading, isLocalLocked, isPasswordRecovery, segments, router]);

  // Sync scheduled push reminders on login
  useEffect(() => {
    if (session && !isLocalLocked && !isPasswordRecovery) {
      syncReminderSchedules().catch(e => console.error('Error syncing notifications:', e));
    }
  }, [session, isLocalLocked, isPasswordRecovery]);

  if (isPasswordRecovery) {
    return (
      <PasswordReset
        linkLoading={recoveryLinkLoading}
        linkError={recoveryLinkError}
        onFinished={finishPasswordRecovery}
      />
    );
  }

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
