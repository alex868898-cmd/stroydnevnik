import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../services/supabase';
import { useAuthGate } from '../../contexts/AuthGateContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session, completePasswordRecovery, signOut } = useAuthGate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!session) {
      Alert.alert('Посилання недійсне', 'Запросіть новий лист для відновлення паролю.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Помилка', 'Пароль повинен містити щонайменше 6 символів.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Помилка', 'Введені паролі не співпадають.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      completePasswordRecovery();
      Alert.alert('Пароль змінено', 'Тепер ви можете входити з новим паролем.', [
        { text: 'Продовжити', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося змінити пароль.';
      Alert.alert('Помилка', message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>KOSHTOR</Text>
        <Text style={styles.title}>Новий пароль</Text>
        <Text style={styles.subtitle}>
          Введіть новий пароль двічі. Після збереження старий пароль більше не працюватиме.
        </Text>

        <Text style={styles.label}>Новий пароль</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Щонайменше 6 символів"
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />

        <Text style={styles.label}>Повторіть пароль</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Повторіть новий пароль"
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          onSubmitEditing={handleSave}
        />

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Зберегти новий пароль</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleCancel} disabled={loading}>
          <Text style={styles.secondaryButtonText}>Скасувати та вийти</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
  },
  logo: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 18,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 10,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  label: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});
