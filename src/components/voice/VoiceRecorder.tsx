import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder, RecordingPresets, useAudioRecorderState } from 'expo-audio';
import { COLORS } from '../../lib/constants';

interface VoiceRecorderProps {
  onRecordingFinished: (uri: string) => void;
  isProcessing: boolean;
  processingStatus: string;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onRecordingFinished,
  isProcessing,
  processingStatus,
}) => {
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Initialize the expo-audio recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const isRecording = recorderState?.isRecording || false;

  // Pulse animation when recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Duration timer
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      pulseAnim.setValue(1);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const handlePress = async () => {
    if (isProcessing) return;

    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      // Rule: prepareToRecordAsync перед каждым record
      await audioRecorder.prepareToRecordAsync();
      await audioRecorder.record();
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Помилка', 'Не вдалося почати запис аудіо. Перевірте дозволи мікрофона.');
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      
      // Rule: stop + 350ms delay (Android flush)
      setTimeout(() => {
        const uri = audioRecorder.uri;
        if (uri) {
          onRecordingFinished(uri);
        } else {
          Alert.alert('Помилка', 'Файл запису не знайдено');
        }
      }, 350);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Помилка', 'Не вдалося зупинити запис');
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <View style={styles.container}>
      {isRecording && (
        <Text style={styles.timerText}>{formatTime(duration)}</Text>
      )}

      {isProcessing && (
        <Text style={styles.statusText}>{processingStatus}</Text>
      )}

      <View style={styles.buttonWrapper}>
        {isRecording && (
          <Animated.View 
            style={[
              styles.pulseCircle, 
              { transform: [{ scale: pulseAnim }] }
            ]} 
          />
        )}
        <TouchableOpacity
          style={[
            styles.micButton,
            isRecording && styles.micButtonActive,
            isProcessing && styles.micButtonDisabled
          ]}
          onPress={handlePress}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          {isProcessing ? (
            <Ionicons name="ellipsis-horizontal" size={32} color={COLORS.textSecondary} />
          ) : isRecording ? (
            <Ionicons name="stop" size={32} color="#fff" />
          ) : (
            <Ionicons name="mic" size={36} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>
        {isProcessing
          ? 'Обробка аудіо...'
          : isRecording
          ? 'Натисніть для збереження'
          : 'Натисніть та диктуйте виконані роботи'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    width: '100%',
  },
  timerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
    marginBottom: 10,
  },
  statusText: {
    fontSize: 15,
    color: COLORS.accent,
    fontWeight: '600',
    marginBottom: 10,
  },
  buttonWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  pulseCircle: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  micButtonActive: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
  },
  micButtonDisabled: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowOpacity: 0,
    elevation: 0,
  },
  hintText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
