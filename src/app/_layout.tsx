import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar, Platform } from 'react-native';
import { Stack, Slot, useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { AuthGateProvider, useAuthGate } from '../contexts/AuthGateContext';
import { PinEntry } from '../components/auth/PinEntry';
import { COLORS } from '../lib/constants';
import { syncReminderSchedules } from '../services/notifications';

// Determine if we are running inside Expo Go
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Safely require expo-notifications only if not in Expo Go to prevent crashes in dev client
let Notifications: any = null;
if (!isExpoGo && Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    console.warn('Failed to load expo-notifications in layout:', e);
  }
}

function RootLayoutContent() {
  const { session, loading, isLocalLocked, unlockLocal, signOut } = useAuthGate();
  const segments = useSegments();
  const router = useRouter();

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

  // Request startup permissions on first run after authorization
  useEffect(() => {
    const requestStartupPermissions = async () => {
      if (session && !isLocalLocked) {
        try {
          const hasRequested = await AsyncStorage.getItem('has_requested_startup_permissions');
          if (!hasRequested) {
            // 1. Microphone permission (safe to call directly from expo-audio)
            try {
              await requestRecordingPermissionsAsync();
            } catch (err) {
              console.error('Error requesting recording permission:', err);
            }

            // 2. Notification permission (safely loaded/guarded)
            try {
              if (Notifications) {
                await Notifications.requestPermissionsAsync();
              }
            } catch (err) {
              console.error('Error requesting notification permission:', err);
            }

            // Mark as requested
            await AsyncStorage.setItem('has_requested_startup_permissions', 'true');
          }
        } catch (err) {
          console.error('Error in startup permissions request:', err);
        }
      }
    };

    requestStartupPermissions();
  }, [session, isLocalLocked]);

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
