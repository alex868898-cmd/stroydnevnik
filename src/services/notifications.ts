import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { STORAGE_KEYS, DEFAULT_NOTIFICATIONS } from '../lib/constants';

// Determine if we are running inside Expo Go
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Safely require expo-notifications only if not in Expo Go (or load statically but guard executions)
let Notifications: any = null;
if (!isExpoGo && Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('Failed to load expo-notifications:', e);
  }
}

/**
 * Requests push notifications permissions from the user
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo || !Notifications) {
    return true; // Auto-grant mock permission for web/Expo Go testing
  }
  
  try {
    // Android 13+ only shows the permission prompt after at least one
    // notification channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Нагадування KOSHTOR',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    return finalStatus === 'granted';
  } catch (e) {
    console.error('Error requesting notifications permissions:', e);
    return false;
  }
}

/**
 * Synchronizes scheduled notifications based on user settings stored in AsyncStorage.
 * Clears all existing notifications and reschedules them (Runs only in standalone APK).
 */
export async function syncReminderSchedules(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo || !Notifications) {
    return true; // Skip scheduling in Expo Go / Web
  }

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return false;

    // Cancel all pending notifications before rescheduling
    await Notifications.cancelAllScheduledNotificationsAsync();

    // 1. DAILY REMINDER
    const dailyHourStr = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_HOUR);
    const dailyMinStr = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_MINUTE);
    const dailyHour = dailyHourStr ? parseInt(dailyHourStr) : DEFAULT_NOTIFICATIONS.REMINDER_HOUR;
    const dailyMin = dailyMinStr ? parseInt(dailyMinStr) : DEFAULT_NOTIFICATIONS.REMINDER_MINUTE;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Час записати роботи! 🏗️',
        body: 'Зафіксуй виконані сьогодні роботи голосом у KOSHTOR.',
        sound: true,
      },
      trigger: {
        type: 'daily',
        channelId: 'default',
        hour: dailyHour,
        minute: dailyMin,
      },
    });

    // 2. WEEKLY REMINDER
    const weeklyEnabled = await AsyncStorage.getItem(STORAGE_KEYS.WEEKLY_REMINDER_ENABLED);
    const isWeeklyEnabled = weeklyEnabled !== 'false';

    if (isWeeklyEnabled) {
      const weeklyDayStr = await AsyncStorage.getItem(STORAGE_KEYS.WEEKLY_REMINDER_DAY);
      const weeklyHourStr = await AsyncStorage.getItem(STORAGE_KEYS.WEEKLY_REMINDER_HOUR);
      
      const weeklyDay = weeklyDayStr ? parseInt(weeklyDayStr) : DEFAULT_NOTIFICATIONS.WEEKLY_DAY;
      const weeklyHour = weeklyHourStr ? parseInt(weeklyHourStr) : DEFAULT_NOTIFICATIONS.WEEKLY_HOUR;

      const expoWeekday = weeklyDay + 1; // JS 0-6 to Expo 1-7

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Тиждень закінчується 📊',
          body: 'Звітний тиждень добігає кінця. Сформуй кошторис та поділись із замовником!',
          sound: true,
        },
        trigger: {
          type: 'weekly',
          channelId: 'default',
          weekday: expoWeekday,
          hour: weeklyHour,
          minute: 0,
        },
      });
    }

    // 3. PENDING VOLUMES REMINDER (One-shot)
    const pendingVolumesDesc = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_VOLUMES_DESC);
    const pendingVolumesDate = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_VOLUMES_DATE);

    if (pendingVolumesDesc && pendingVolumesDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(12, 0, 0, 0);

      if (tomorrow.getTime() > Date.now()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Уточнення об\'ємів робіт 📏',
            body: `Не забудь вказати об'єми для: ${pendingVolumesDesc}`,
            sound: true,
          },
          trigger: {
            type: 'date',
            date: tomorrow,
            channelId: 'default',
          },
        });
      }
    }
    return true;
  } catch (error) {
    console.error('Error syncing notifications in standalone build:', error);
    return false;
  }
}

export async function saveReminderSettings(
  dailyHour: number,
  dailyMinute: number,
  weeklyEnabled: boolean,
  weeklyDay: number,
  weeklyHour: number,
): Promise<boolean> {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.REMINDER_HOUR, String(dailyHour)],
    [STORAGE_KEYS.REMINDER_MINUTE, String(dailyMinute)],
    [STORAGE_KEYS.WEEKLY_REMINDER_ENABLED, weeklyEnabled ? 'true' : 'false'],
    [STORAGE_KEYS.WEEKLY_REMINDER_DAY, String(weeklyDay)],
    [STORAGE_KEYS.WEEKLY_REMINDER_HOUR, String(weeklyHour)],
  ]);
  return syncReminderSchedules();
}

/**
 * Saves daily reminder settings and syncs notifications
 */
export async function saveDailyReminderSettings(hour: number, minute: number): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.REMINDER_HOUR, String(hour));
  await AsyncStorage.setItem(STORAGE_KEYS.REMINDER_MINUTE, String(minute));
  await syncReminderSchedules();
}

/**
 * Saves weekly reminder settings and syncs notifications
 */
export async function saveWeeklyReminderSettings(enabled: boolean, day: number, hour: number): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.WEEKLY_REMINDER_ENABLED, enabled ? 'true' : 'false');
  await AsyncStorage.setItem(STORAGE_KEYS.WEEKLY_REMINDER_DAY, String(day));
  await AsyncStorage.setItem(STORAGE_KEYS.WEEKLY_REMINDER_HOUR, String(hour));
  await syncReminderSchedules();
}

/**
 * Saves pending volume state and syncs notifications
 */
export async function setPendingVolumesNotification(description: string): Promise<void> {
  if (description) {
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VOLUMES_DESC, description);
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VOLUMES_DATE, new Date().toISOString());
  } else {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_VOLUMES_DESC);
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_VOLUMES_DATE);
  }
  await syncReminderSchedules();
}
