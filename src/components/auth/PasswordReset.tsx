import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../services/supabase';
import { markPasswordRecoveryHandled } from '../../services/passwordRecovery';
import { COLORS } from '../../lib/constants';

interface PasswordResetProps {
  linkLoading: boolean;
  linkError: string | null;
  onFinished: () => void;
}

export function PasswordReset({ linkLoading, linkError, onFinished }: PasswordResetProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const returnToLogin = async () => {
    await markPasswordRecoveryHandled();
    await supabase.auth.signOut();
    onFinished();
  };

  const changePassword = async () => {
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError('Новий пароль має містити щонайменше 8 символів.');
      return;
    }
    if (password !== confirmation) {
      setSubmitError('Паролі не збігаються.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSubmitError('Посилання недійсне або застаріло. Запросіть новий лист.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setSubmitError(error.message);
        return;
      }

      await markPasswordRecoveryHandled();
      await supabase.auth.signOut();
      setPasswordChanged(true);
    } catch (error) {
      console.error('Unable to update password:', error);
      setSubmitError('Не вдалося змінити пароль. Перевірте інтернет і спробуйте ще раз.');
    } finally {
      setSubmitting(false);
    }
  };

  if (linkLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.statusText}>Перевіряємо посилання…</Text>
      </View>
    );
  }

  if (passwordChanged) {
    return (
      <View style={styles.centered}>
        <Text style={styles.logo}>KOSHTOR</Text>
        <Text style={styles.title}>Пароль успішно змінено</Text>
        <Text style={styles.subtitle}>Тепер увійдіть до застосунку з новим паролем.</Text>
        <TouchableOpacity style={styles.button} onPress={onFinished}>
          <Text style={styles.buttonText}>Увійти з новим паролем</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (linkError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.logo}>KOSHTOR</Text>
        <Text style={styles.title}>Посилання не працює</Text>
        <Text style={styles.errorText}>{linkError}</Text>
        <TouchableOpacity style={styles.button} onPress={returnToLogin}>
          <Text style={styles.buttonText}>Запросити новий лист</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.logo}>KOSHTOR</Text>
          <Text style={styles.title}>Створіть новий пароль</Text>
          <Text style={styles.subtitle}>
            Введіть новий пароль двічі. Після збереження увійдіть з ним до застосунку.
          </Text>

          <Text style={styles.label}>Новий пароль</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Щонайменше 8 символів"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.label}>Повторіть пароль</Text>
          <TextInput
            style={styles.input}
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Повторіть новий пароль"
            placeholderTextColor={COLORS.textMuted}
            onSubmitEditing={changePassword}
          />

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={changePassword}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Зберегти новий пароль</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 16,
    padding: 24,
  },
  logo: {
    color: COLORS.primary,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
  },
  statusText: {
    color: COLORS.textSecondary,
    marginTop: 14,
    fontSize: 15,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    color: COLORS.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    width: '100%',
    maxWidth: 360,
    minHeight: 48,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
