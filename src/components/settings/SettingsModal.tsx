import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, ScrollView, Switch, Alert, TextInput, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, DEFAULT_NOTIFICATIONS } from '../../lib/constants';
import { useAuthGate } from '../../contexts/AuthGateContext';
import { hasPinSet, setPin, deletePin } from '../../services/pinAuth';
import { isBiometricHardwareAvailable, isBiometricEnrolled, isBiometricEnabled, setBiometricEnabled } from '../../services/biometricAuth';
import { saveReminderSettings } from '../../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../lib/constants';
import { supabase, clearCatalogCache } from '../../services/supabase';
import { getContractorProfile, saveContractorProfile } from '../../services/contractorProfile';
import { importPriceFile } from '../../services/priceKnowledge';
import { toLocalISODate } from '../../lib/formatters';
import Constants from 'expo-constants';
import { hasMicrophonePermission, requestMicrophonePermission } from '../../services/microphonePermission';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

interface AggregatedPriceStat {
  workType: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose }) => {
  const { signOut } = useAuthGate();

  // Security Settings
  const [pinActive, setPinActive] = useState(false);
  const [bioActive, setBioActive] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Reminder Settings
  const [dailyHour, setDailyHour] = useState(DEFAULT_NOTIFICATIONS.REMINDER_HOUR);
  const [dailyMinute, setDailyMinute] = useState(DEFAULT_NOTIFICATIONS.REMINDER_MINUTE);
  
  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [weeklyDay, setWeeklyDay] = useState(DEFAULT_NOTIFICATIONS.WEEKLY_DAY);
  const [weeklyHour, setWeeklyHour] = useState(DEFAULT_NOTIFICATIONS.WEEKLY_HOUR);

  // Market Prices statistics states
  const [showMarketPrices, setShowMarketPrices] = useState(false);
  const [loadingMarketPrices, setLoadingMarketPrices] = useState(false);
  const [marketPricesList, setMarketPricesList] = useState<AggregatedPriceStat[]>([]);
  const [contractorName, setContractorName] = useState('');
  const [contractorPhone, setContractorPhone] = useState('');
  const [savingContractor, setSavingContractor] = useState(false);
  const [importingPrices, setImportingPrices] = useState(false);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.9';
  const androidVersionCode = Constants.expoConfig?.android?.versionCode ?? 10;

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  useEffect(() => {
    if (showMarketPrices) {
      loadMarketPrices();
    }
  }, [showMarketPrices]);

  const loadSettings = async () => {
    try {
      // Load Security States
      const hasPin = await hasPinSet();
      setPinActive(hasPin);
      
      const hardwareAvailable = await isBiometricHardwareAvailable();
      const enrolled = await isBiometricEnrolled();
      const isBioSupported = hardwareAvailable && enrolled;
      setBioSupported(isBioSupported);
      
      if (isBioSupported) {
        const bioEnabled = await isBiometricEnabled();
        setBioActive(bioEnabled);
      }

      // Load Daily Reminder Times
      const storedDailyHour = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_HOUR);
      const storedDailyMin = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_MINUTE);
      if (storedDailyHour) setDailyHour(parseInt(storedDailyHour));
      if (storedDailyMin) setDailyMinute(parseInt(storedDailyMin));

      // Load Weekly Reminder Times
      const storedWeeklyEnabled = await AsyncStorage.getItem(STORAGE_KEYS.WEEKLY_REMINDER_ENABLED);
      const storedWeeklyDay = await AsyncStorage.getItem(STORAGE_KEYS.WEEKLY_REMINDER_DAY);
      const storedWeeklyHour = await AsyncStorage.getItem(STORAGE_KEYS.WEEKLY_REMINDER_HOUR);

      if (storedWeeklyEnabled) setWeeklyEnabled(storedWeeklyEnabled !== 'false');
      if (storedWeeklyDay) setWeeklyDay(parseInt(storedWeeklyDay));
      if (storedWeeklyHour) setWeeklyHour(parseInt(storedWeeklyHour));

      const contractor = await getContractorProfile();
      setContractorName(contractor.name);
      setContractorPhone(contractor.phone);
      setMicrophoneGranted(await hasMicrophonePermission());
      
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  const loadMarketPrices = async () => {
    setLoadingMarketPrices(true);
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const ninetyDaysAgoStr = toLocalISODate(ninetyDaysAgo);

      const { data, error } = await supabase
        .from('price_statistics')
        .select('work_type, price')
        .gt('recorded_at', ninetyDaysAgoStr);

      if (error) throw error;

      if (data) {
        // Group and aggregate data client side
        const groups: Record<string, number[]> = {};
        data.forEach(row => {
          const wt = row.work_type;
          const p = Number(row.price);
          if (!groups[wt]) {
            groups[wt] = [];
          }
          groups[wt].push(p);
        });

        const aggregated: AggregatedPriceStat[] = Object.keys(groups).map(wt => {
          const prices = groups[wt];
          const priceMin = Math.min(...prices);
          const priceMax = Math.max(...prices);
          const priceAvg = Math.round(prices.reduce((sum, val) => sum + val, 0) / prices.length);
          return {
            workType: wt,
            min: priceMin,
            max: priceMax,
            avg: priceAvg,
            count: prices.length
          };
        });

        // Sort by count descending and take top 20
        const sorted = aggregated
          .sort((a, b) => b.count - a.count)
          .slice(0, 20);

        setMarketPricesList(sorted);
      }
    } catch (err) {
      console.error('Failed to load market prices list:', err);
      Alert.alert('Помилка', 'Не вдалося завантажити ринкові ціни');
    } finally {
      setLoadingMarketPrices(false);
    }
  };

  const handleImportPrices = async () => {
    setImportingPrices(true);
    try {
      const result = await importPriceFile();
      if (!result) return;
      Alert.alert('Прайс завантажено', `${result.fileName}: додано ${result.count} позицій. Максимальні ціни вже доступні для автопідстановки.`);
      if (showMarketPrices) await loadMarketPrices();
    } catch (error: any) {
      Alert.alert('Не вдалося завантажити прайс', error?.message || 'Перевірте формат таблиці');
    } finally {
      setImportingPrices(false);
    }
  };

  const handlePinToggle = async (value: boolean) => {
    if (value) {
      setShowPinSetup(true);
    } else {
      Alert.alert(
        'Вимкнути PIN-код?',
        'Ви дійсно бажаєте вимкнути PIN-код? Це знизить безпеку вашого додатку.',
        [
          { text: 'Скасувати', style: 'cancel' },
          { 
            text: 'Так, вимкнути', 
            style: 'destructive', 
            onPress: async () => {
              await deletePin();
              await setBiometricEnabled(false); // disable bio too if PIN is off
              setPinActive(false);
              setBioActive(false);
            }
          }
        ]
      );
    }
  };

  const handleSavePin = async () => {
    if (newPin.length < 4) {
      Alert.alert('Помилка', 'PIN-код повинен містити не менше 4 цифр');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Помилка', 'PIN-коди не співпадають');
      return;
    }

    try {
      await setPin(newPin);
      setPinActive(true);
      setShowPinSetup(false);
      setNewPin('');
      setConfirmPin('');
      Alert.alert('Успішно', 'PIN-код встановлено!');
      
      // Offer biometrics if supported and not enabled
      if (bioSupported && !bioActive) {
        Alert.alert(
          'Біометрія',
          'Бажаєте увімкнути вхід за відбитком пальця / FaceID?',
          [
            { text: 'Ні' },
            { 
              text: 'Так, увімкнути', 
              onPress: async () => {
                await setBiometricEnabled(true);
                setBioActive(true);
              }
            }
          ]
        );
      }
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося зберегти PIN-код');
    }
  };

  const handleBioToggle = async (value: boolean) => {
    if (value && !pinActive) {
      Alert.alert('Попередження', 'Спочатку необхідно встановити PIN-код як резервний спосіб входу');
      return;
    }
    await setBiometricEnabled(value);
    setBioActive(value);
  };

  const handleSaveReminders = async () => {
    try {
      const enabled = await saveReminderSettings(dailyHour, dailyMinute, weeklyEnabled, weeklyDay, weeklyHour);
      if (enabled) {
        Alert.alert('Збережено', 'Налаштування нагадувань оновлено');
      } else {
        Alert.alert(
          'Сповіщення вимкнені',
          'Дозвольте KOSHTOR надсилати сповіщення у налаштуваннях телефону.',
          [
            { text: 'Пізніше', style: 'cancel' },
            { text: 'Відкрити налаштування', onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося оновити нагадування');
    }
  };

  const handleClearCache = async () => {
    clearCatalogCache();
    Alert.alert('Успішно', 'Кеш каталогу розцінок очищено. Його буде оновлено при наступному запиті.');
  };

  const handleMicrophonePermission = async () => {
    setRequestingMicrophone(true);
    try {
      const permission = await requestMicrophonePermission();
      const granted = permission === 'granted';
      setMicrophoneGranted(granted);

      if (granted) {
        Alert.alert('Мікрофон підключено', 'Голосове введення готове до роботи.');
        return;
      }

      Alert.alert(
        'Доступ до мікрофона не надано',
        permission === 'blocked'
          ? 'Android заблокував повторний запит. Відкрийте налаштування KOSHTOR та дозвольте використання мікрофона.'
          : 'Натисніть кнопку ще раз, щоб повторити системний запит Android.',
        [
          { text: 'Закрити', style: 'cancel' },
          { text: 'Відкрити налаштування', onPress: () => Linking.openSettings() },
        ],
      );
    } finally {
      setRequestingMicrophone(false);
    }
  };

  const handleSaveContractor = async () => {
    if (!contractorName.trim()) {
      Alert.alert('Помилка', 'Вкажіть назву організації або ім’я підрядника');
      return;
    }
    setSavingContractor(true);
    try {
      await saveContractorProfile({ name: contractorName, phone: contractorPhone });
      Alert.alert('Збережено', 'Дані підрядника будуть додані до PDF-звітів');
    } finally {
      setSavingContractor(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Вихід з додатку',
      'Ви впевнені, що хочете вийти з вашого облікового запису?',
      [
        { text: 'Ні', style: 'cancel' },
        { 
          text: 'Так, вийти', 
          style: 'destructive', 
          onPress: async () => {
            onClose();
            await signOut();
          } 
        }
      ]
    );
  };

  const weekdays = [
    { label: 'Понеділок', value: 1 },
    { label: 'Вівторок', value: 2 },
    { label: 'Середа', value: 3 },
    { label: 'Четвер', value: 4 },
    { label: 'П\'ятниця', value: 5 },
    { label: 'Субота', value: 6 },
    { label: 'Неділя', value: 0 },
  ];

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Налаштування ⚙️</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionTitle}>Власний прайс</Text>
            <View style={styles.card}>
              <Text style={styles.settingDesc}>Excel або CSV: колонки «Найменування роботи», «Одиниця» та «Ціна». Дані поповнять загальну базу цін.</Text>
              <TouchableOpacity style={styles.saveRemindersBtn} onPress={handleImportPrices} disabled={importingPrices}>
                {importingPrices ? <ActivityIndicator color="#fff" /> : (
                  <View style={styles.row}><Ionicons name="cloud-upload-outline" size={20} color="#fff" /><Text style={[styles.saveRemindersBtnText, { marginLeft: 8 }]}>Завантажити прайс</Text></View>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Дані підрядника для PDF</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Організація або ім’я</Text>
                <TextInput style={styles.textInput} value={contractorName} onChangeText={setContractorName} placeholder="Напр. Stroykeeper або Сергій" placeholderTextColor={COLORS.textMuted} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Контактний телефон</Text>
                <TextInput style={styles.textInput} value={contractorPhone} onChangeText={setContractorPhone} keyboardType="phone-pad" placeholder="+380…" placeholderTextColor={COLORS.textMuted} />
              </View>
              <TouchableOpacity style={styles.saveRemindersBtn} onPress={handleSaveContractor} disabled={savingContractor}>
                {savingContractor ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveRemindersBtnText}>Зберегти дані підрядника</Text>}
              </TouchableOpacity>
            </View>

            {/* SECURITY SECTION */}
            <Text style={styles.sectionTitle}>Безпека та локальний захист</Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>Захист PIN-кодом</Text>
                  <Text style={styles.settingDesc}>Запитувати PIN при кожному запуску</Text>
                </View>
                <Switch
                  value={pinActive}
                  onValueChange={handlePinToggle}
                  trackColor={{ false: COLORS.background, true: COLORS.primary }}
                />
              </View>

              {bioSupported && (
                <View style={[styles.settingRow, styles.borderTop]}>
                  <View style={styles.settingTextGroup}>
                    <Text style={styles.settingLabel}>Біометрія (FaceID / TouchID)</Text>
                    <Text style={styles.settingDesc}>Швидкий вхід за допомогою пальця чи обличчя</Text>
                  </View>
                  <Switch
                    value={bioActive}
                    onValueChange={handleBioToggle}
                    trackColor={{ false: COLORS.background, true: COLORS.primary }}
                    disabled={!pinActive}
                  />
                </View>
              )}
            </View>

            {/* PIN Setup Dialog (inline) */}
            {showPinSetup && (
              <View style={[styles.card, styles.pinSetupCard]}>
                <Text style={styles.setupTitle}>Встановлення нового PIN-коду</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Введіть 4-значний PIN</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                    value={newPin}
                    onChangeText={setNewPin}
                    placeholder="xxxx"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Підтвердіть PIN</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                    value={confirmPin}
                    onChangeText={setConfirmPin}
                    placeholder="xxxx"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.setupActions}>
                  <TouchableOpacity 
                    style={styles.setupCancelBtn} 
                    onPress={() => {
                      setShowPinSetup(false);
                      setNewPin('');
                      setConfirmPin('');
                    }}
                  >
                    <Text style={styles.setupCancelText}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.setupSaveBtn} onPress={handleSavePin}>
                    <Text style={styles.setupSaveText}>Встановити</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* REMINDERS SECTION */}
            <Text style={styles.sectionTitle}>Сповіщення та нагадування</Text>
            <View style={styles.card}>
              {/* Daily */}
              <View style={styles.settingRow}>
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>Щоденне нагадування</Text>
                  <Text style={styles.settingDesc}>Нагадати про запис виконаних робіт</Text>
                </View>
              </View>
              <View style={styles.timePickerContainer}>
                <Text style={styles.pickerLabel}>Час нагадування:</Text>
                <View style={styles.row}>
                  <TextInput
                    style={styles.timeInput}
                    keyboardType="numeric"
                    value={String(dailyHour).padStart(2, '0')}
                    onChangeText={(val) => {
                      const h = Math.min(23, Math.max(0, parseInt(val) || 0));
                      setDailyHour(h);
                    }}
                  />
                  <Text style={styles.timeDivider}>:</Text>
                  <TextInput
                    style={styles.timeInput}
                    keyboardType="numeric"
                    value={String(dailyMinute).padStart(2, '0')}
                    onChangeText={(val) => {
                      const m = Math.min(59, Math.max(0, parseInt(val) || 0));
                      setDailyMinute(m);
                    }}
                  />
                </View>
              </View>

              {/* Weekly */}
              <View style={[styles.settingRow, styles.borderTop, { marginTop: 15, paddingTop: 15 }]}>
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>Щотижневе нагадування</Text>
                  <Text style={styles.settingDesc}>Нагадати сформувати кошторис в кінці тижня</Text>
                </View>
                <Switch
                  value={weeklyEnabled}
                  onValueChange={setWeeklyEnabled}
                  trackColor={{ false: COLORS.background, true: COLORS.primary }}
                />
              </View>

              {weeklyEnabled && (
                <View style={styles.weeklyPickerContainer}>
                  <View style={styles.pickerSelector}>
                    <Text style={styles.pickerLabel}>День тижня:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {weekdays.map(d => (
                        <TouchableOpacity
                          key={d.value}
                          style={[
                            styles.dayTag,
                            weeklyDay === d.value && styles.dayTagActive
                          ]}
                          onPress={() => setWeeklyDay(d.value)}
                        >
                          <Text style={[styles.dayTagText, weeklyDay === d.value && styles.dayTagTextActive]}>
                            {d.label.slice(0, 3)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={[styles.timePickerContainer, { marginTop: 10 }]}>
                    <Text style={styles.pickerLabel}>Час нагадування:</Text>
                    <View style={styles.row}>
                      <TextInput
                        style={styles.timeInput}
                        keyboardType="numeric"
                        value={String(weeklyHour).padStart(2, '0')}
                        onChangeText={(val) => {
                          const h = Math.min(23, Math.max(0, parseInt(val) || 0));
                          setWeeklyHour(h);
                        }}
                      />
                      <Text style={styles.timeDivider}>:</Text>
                      <TextInput
                        style={styles.timeInput}
                        keyboardType="numeric"
                        value="00"
                        editable={false}
                      />
                    </View>
                  </View>
                </View>
              )}

              <TouchableOpacity style={styles.saveRemindersBtn} onPress={handleSaveReminders}>
                <Text style={styles.saveRemindersBtnText}>Зберегти розклад нагадувань</Text>
              </TouchableOpacity>
            </View>

            {/* ANALYTICS SECTION */}
            <Text style={styles.sectionTitle}>Аналітика цін</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.actionRow} onPress={() => setShowMarketPrices(true)}>
                <Ionicons name="bar-chart-outline" size={24} color={COLORS.primary} style={styles.actionIcon} />
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>Ринкові ціни 📊</Text>
                  <Text style={styles.settingDesc}>Топ-20 популярних робіт за останні 90 днів</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* SYSTEM CACHE */}
            <Text style={styles.sectionTitle}>Системні налаштування</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.actionRow} onPress={handleMicrophonePermission} disabled={requestingMicrophone}>
                <Ionicons
                  name={microphoneGranted ? 'mic-circle' : 'mic-circle-outline'}
                  size={24}
                  color={microphoneGranted ? COLORS.accent : COLORS.primary}
                  style={styles.actionIcon}
                />
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>Доступ до мікрофона</Text>
                  <Text style={styles.settingDesc}>
                    {microphoneGranted ? 'Дозвіл надано' : 'Натисніть, щоб відкрити системний запит Android'}
                  </Text>
                </View>
                {requestingMicrophone && <ActivityIndicator color={COLORS.primary} />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
                <Ionicons name="refresh-circle-outline" size={24} color={COLORS.primary} style={styles.actionIcon} />
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>Очистити кеш каталогу цін</Text>
                  <Text style={styles.settingDesc}>Оновити розцінки з хмари при наступному запиті</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* LOGOUT BUTTON */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.logoutText}>Вийти з облікового запису</Text>
            </TouchableOpacity>
            <Text style={styles.versionText}>KOSHTOR {appVersion} · Збірка {androidVersionCode}</Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Market Prices Sub-Modal */}
      <Modal
        visible={showMarketPrices}
        animationType="slide"
        onRequestClose={() => setShowMarketPrices(false)}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setShowMarketPrices(false)} style={styles.backBtn}>
              <View style={styles.row}>
                <Ionicons name="arrow-back" size={24} color={COLORS.text} style={{ marginRight: 6 }} />
                <Text style={styles.backBtnText}>Назад</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Ринкові ціни 📊</Text>
          </View>

          {loadingMarketPrices ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : marketPricesList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="stats-chart-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Немає статистики</Text>
              <Text style={styles.emptySubtitle}>
                Статистика формується на основі експортованих кошторисів за останні 90 днів.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.sectionSubtitle}>Топ-20 популярних робіт (за останні 90 днів):</Text>
              {marketPricesList.map((stat, idx) => (
                <View key={stat.workType} style={styles.statCard}>
                  <View style={styles.statCardHeader}>
                    <Text style={styles.statIndex}>{idx + 1}.</Text>
                    <Text style={styles.statWorkName} numberOfLines={1}>{stat.workType}</Text>
                    <Text style={styles.statCount}>({stat.count} {stat.count === 1 ? 'запис' : stat.count < 5 ? 'записи' : 'записів'})</Text>
                  </View>
                  <View style={styles.statCardDetails}>
                    <View style={styles.statDetailCol}>
                      <Text style={styles.statDetailLabel}>Діапазон:</Text>
                      <Text style={styles.statDetailValue}>{stat.min} — {stat.max} грн</Text>
                    </View>
                    <View style={styles.statDetailCol}>
                      <Text style={styles.statDetailLabel}>Середня:</Text>
                      <Text style={[styles.statDetailValue, { color: COLORS.accent, fontWeight: 'bold' }]}>
                        {stat.avg} грн
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingTextGroup: {
    flex: 1,
    paddingRight: 10,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    marginTop: 12,
    paddingTop: 12,
  },
  
  // Time selector
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  pickerLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    color: COLORS.text,
    width: 48,
    height: 38,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timeDivider: {
    color: COLORS.text,
    fontSize: 18,
    marginHorizontal: 5,
    fontWeight: 'bold',
  },

  // Weekly Picker Day list
  weeklyPickerContainer: {
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingTop: 15,
  },
  pickerSelector: {
    gap: 10,
    marginBottom: 10,
  },
  dayTag: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  dayTagActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayTagText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  dayTagTextActive: {
    color: '#fff',
  },

  saveRemindersBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  saveRemindersBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  // PIN Setup Card
  pinSetupCard: {
    backgroundColor: '#1E293B',
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    marginTop: -10,
    marginBottom: 25,
  },
  setupTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 4,
  },
  setupActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  setupCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  setupCancelText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  setupSaveBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  setupSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // System Cache / Action list
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    marginRight: 12,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
  },
  logoutText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  versionText: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },

  // Market prices list styles
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 10,
  },
  backBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 15,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: 15,
  },
  statCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 12,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  statIndex: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  statWorkName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  statCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  statCardDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingTop: 10,
  },
  statDetailCol: {
    flex: 1,
  },
  statDetailLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statDetailValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
