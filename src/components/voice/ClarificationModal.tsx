import React from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '../../lib/constants';
import { ClarificationPrompt } from '../../lib/types';

interface ClarificationModalProps {
  visible: boolean;
  clarifications: ClarificationPrompt[];
  currentIndex: number;
  onSelect: (option: string) => void;
  onCancel: () => void;
}

export const ClarificationModal: React.FC<ClarificationModalProps> = ({
  visible,
  clarifications,
  currentIndex,
  onSelect,
  onCancel,
}) => {
  if (!visible || clarifications.length === 0 || currentIndex >= clarifications.length) {
    return null;
  }

  const prompt = clarifications[currentIndex];

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.alertBox}>
          <Text style={styles.header}>Уточнення роботи 🤔</Text>
          <Text style={styles.description}>
            Ви вказали <Text style={styles.highlight}>«{prompt.workTypePlaceholder}»</Text>. 
            Оберіть точний варіант з каталогу цін для правильного розрахунку:
          </Text>

          <ScrollView style={styles.optionsList} contentContainerStyle={styles.scrollContent}>
            {prompt.options.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.optionButton}
                onPress={() => onSelect(option)}
              >
                <Text style={styles.optionText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Скасувати запис</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)', // Dark translucent overlay
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  highlight: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  optionsList: {
    maxHeight: 200,
    marginBottom: 20,
  },
  scrollContent: {
    gap: 10,
  },
  optionButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  optionText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  cancelButton: {
    paddingVertical: 8,
  },
  cancelText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
  },
});
