import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { verifyPin } from '../../services/pinAuth';
import { authenticateBiometrics, isBiometricEnabled } from '../../services/biometricAuth';

interface PinEntryProps {
  onSuccess: () => void;
  onAlternativeAuth?: () => void;
  title?: string;
}

export const PinEntry: React.FC<PinEntryProps> = ({ 
  onSuccess, 
  onAlternativeAuth, 
  title = 'Введіть PIN-код' 
}) => {
  const [pin, setPin] = useState<string>('');
  const [bioAvailable, setBioAvailable] = useState<boolean>(false);

  useEffect(() => {
    isBiometricEnabled().then(enabled => {
      setBioAvailable(enabled);
      if (enabled) {
        handleBiometric();
      }
    });
  }, []);

  const handleBiometric = async () => {
    const success = await authenticateBiometrics();
    if (success) {
      onSuccess();
    }
  };

  const handleNumberPress = (num: number) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      
      if (nextPin.length === 4) {
        // Automatically check when 4 digits are entered
        validate(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const validate = async (enteredPin: string) => {
    const isValid = await verifyPin(enteredPin);
    if (isValid) {
      onSuccess();
    } else {
      Alert.alert('Помилка', 'Невірний PIN-код');
      setPin('');
    }
  };

  const renderDot = (index: number) => {
    const isFilled = pin.length > index;
    return (
      <View 
        key={index} 
        style={[
          styles.dot, 
          isFilled ? styles.dotFilled : styles.dotEmpty
        ]} 
      />
    );
  };

  const renderKey = (val: number | string, iconName?: keyof typeof Ionicons.glyphMap) => {
    const isNumber = typeof val === 'number';
    const isEmpty = val === '';
    
    return (
      <TouchableOpacity 
        key={val}
        style={[styles.key, isEmpty && styles.keyEmpty]}
        disabled={isEmpty}
        onPress={() => {
          if (isNumber) {
            handleNumberPress(val as number);
          } else if (val === 'backspace') {
            handleBackspace();
          } else if (val === 'bio') {
            handleBiometric();
          }
        }}
      >
        {iconName ? (
          <Ionicons name={iconName} size={28} color={COLORS.text} />
        ) : (
          <Text style={styles.keyText}>{val}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      
      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3].map(renderDot)}
      </View>
      
      <View style={styles.keypad}>
        <View style={styles.row}>
          {[1, 2, 3].map(n => renderKey(n))}
        </View>
        <View style={styles.row}>
          {[4, 5, 6].map(n => renderKey(n))}
        </View>
        <View style={styles.row}>
          {[7, 8, 9].map(n => renderKey(n))}
        </View>
        <View style={styles.row}>
          {bioAvailable 
            ? renderKey('bio', 'finger-print-outline') 
            : renderKey('')
          }
          {renderKey(0)}
          {renderKey('backspace', 'backspace-outline')}
        </View>
      </View>

      {onAlternativeAuth && (
        <TouchableOpacity style={styles.altButton} onPress={onAlternativeAuth}>
          <Text style={styles.altButtonText}>Використати логін/пароль</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 30,
    letterSpacing: 0.5,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginBottom: 50,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginHorizontal: 12,
  },
  dotEmpty: {
    borderWidth: 2,
    borderColor: COLORS.cardBorder,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: COLORS.primary,
  },
  keypad: {
    width: '100%',
    maxWidth: 280,
    marginBottom: 40,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  key: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyEmpty: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  keyText: {
    fontSize: 26,
    fontWeight: '600',
    color: COLORS.text,
  },
  altButton: {
    marginTop: 10,
    padding: 10,
  },
  altButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
