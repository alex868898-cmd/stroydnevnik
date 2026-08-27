import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../services/supabase';
import { COLORS } from '../../lib/constants';
import { hasPinSet, setPin } from '../../services/pinAuth';
import { setBiometricEnabled, isBiometricHardwareAvailable } from '../../services/biometricAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // PIN creation flow state (after successful login if no PIN is set)
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Помилка', 'Будь ласка, введіть email');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'stroydnevnik://',
      });

      if (error) {
        Alert.alert('Помилка', error.message);
        setLoading(false);
        return;
      }

      setLoading(false);
      Alert.alert('Лист надіслано', 'Лист надіслано на вашу пошту');
      setShowForgotPassword(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Помилка', 'Щось пішло не так');
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Помилка', 'Будь ласка, заповніть усі поля');
      return;
    }

    setLoading(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert('Помилка авторизації', error.message);
        setLoading(false);
        return;
      }

      // Check if user has PIN set up locally
      const pinSet = await hasPinSet();
      if (!pinSet) {
        setShowPinSetup(true);
        setLoading(false);
      } else {
        setLoading(false);
        router.replace('/(tabs)');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Помилка', 'Щось пішло не так');
      setLoading(false);
    }
  };

  const handleSetupPin = async () => {
    if (newPin.length < 4) {
      Alert.alert('Помилка', 'PIN-код повинен складатися з 4 цифр');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Помилка', 'PIN-коди не співпадають');
      return;
    }

    try {
      await setPin(newPin);

      // Offer biometrics if hardware supports it
      const bioAvailable = await isBiometricHardwareAvailable();
      if (bioAvailable) {
        Alert.alert(
          'Біометрія',
          'Бажаєте увімкнути вхід за відбитком пальця / FaceID?',
          [
            { 
              text: 'Ні', 
              onPress: () => router.replace('/(tabs)') 
            },
            { 
              text: 'Так, увімкнути', 
              onPress: async () => {
                await setBiometricEnabled(true);
                router.replace('/(tabs)');
              } 
            }
          ]
        );
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося встановити PIN-код');
    }
  };

  if (showForgotPassword) {
    return (
      <View style={styles.container}>
        <View style={styles.formContainer}>
          <Text style={styles.logo}>СтройДневник 🏗️</Text>
          <Text style={styles.title}>Відновлення паролю</Text>
          <Text style={styles.subtitle}>
            Введіть адресу електронної пошти, щоб отримати посилання для відновлення паролю.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Електронна пошта</Text>
            <TextInput
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              placeholder="example@mail.com"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleForgotPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Надіслати</Text>
            )}
          </TouchableOpacity>

          <View style={styles.registerContainer}>
            <TouchableOpacity onPress={() => setShowForgotPassword(false)}>
              <Text style={styles.registerLink}>Повернутися до входу</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (showPinSetup) {
    return (
      <View style={styles.container}>
        <View style={styles.formContainer}>
          <Text style={styles.title}>Встановлення PIN-коду 🔐</Text>
          <Text style={styles.subtitle}>
            Створіть 4-значний PIN для швидкого та безпечного входу в додаток без введення пароля.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Новий PIN-код</Text>
            <TextInput
              style={styles.inputCenter}
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
            <Text style={styles.label}>Підтвердження PIN-коду</Text>
            <TextInput
              style={styles.inputCenter}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder="xxxx"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleSetupPin}>
            <Text style={styles.buttonText}>Встановити PIN та увійти</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.logo}>СтройДневник 🏗️</Text>
        <Text style={styles.title}>Вхід в систему</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Електронна пошта</Text>
          <TextInput
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            placeholder="example@mail.com"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Пароль</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            placeholder="Введіть ваш пароль"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Увійти</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.forgotPasswordBtn} 
          onPress={() => setShowForgotPassword(true)}
        >
          <Text style={styles.forgotPasswordText}>Забули пароль?</Text>
        </TouchableOpacity>

        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>Немає облікового запису? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.registerLink}>Зареєструватися</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  formContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 24,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  inputCenter: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 4,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  registerText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  registerLink: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  forgotPasswordBtn: {
    alignItems: 'center',
    marginTop: 15,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
