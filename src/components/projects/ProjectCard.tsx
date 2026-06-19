import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Project } from '../../lib/types';
import { COLORS } from '../../lib/constants';
import { getStatusInfo, ProjectStatus } from '../../lib/projectStatus';
import { formatCurrency } from '../../lib/formatters';

interface ProjectCardProps {
  project: Project;
  stats?: {
    totalAmount: number;
    logCount: number;
    lastWorkDate: string | null;
  };
  onPress?: () => void;
  onStatusChange?: (id: string, status: ProjectStatus) => void;
  onDelete?: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  stats = { totalAmount: 0, logCount: 0, lastWorkDate: null },
  onPress,
  onStatusChange,
  onDelete,
}) => {
  const statusInfo = getStatusInfo(project.status);

  const handleStatusPress = () => {
    if (!onStatusChange) return;

    Alert.alert(
      'Змінити статус об\'єкту',
      'Оберіть новий статус:',
      [
        { text: '🟢 Активний', onPress: () => onStatusChange(project.id, 'active') },
        { text: '⏸ Призупинений', onPress: () => onStatusChange(project.id, 'paused') },
        { text: '❄️ Заморожений', onPress: () => onStatusChange(project.id, 'frozen') },
        { text: '✅ Завершений', onPress: () => onStatusChange(project.id, 'completed') },
        { text: 'Скасувати', style: 'cancel' }
      ]
    );
  };

  return (
    <TouchableOpacity 
      style={styles.card} 
      onPress={onPress} 
      activeOpacity={0.8}
      disabled={!onPress}
    >
      {/* Header Row */}
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.name}>{project.name}</Text>
          {project.address ? (
            <Text style={styles.address} numberOfLines={1}>
              📍 {project.address}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity 
          style={[styles.statusBadge, { backgroundColor: statusInfo.color + '15', borderColor: statusInfo.color }]}
          onPress={handleStatusPress}
          disabled={!onStatusChange}
        >
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.emoji} {statusInfo.label}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats Divider */}
      <View style={styles.divider} />

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Всього зароблено</Text>
          <Text style={styles.statValue}>{formatCurrency(stats.totalAmount)}</Text>
        </View>
        
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Записів у журналі</Text>
          <Text style={styles.statValue}>{stats.logCount}</Text>
        </View>
      </View>

      {/* Footer Info / Actions */}
      <View style={styles.footer}>
        <Text style={styles.lastDate}>
          {stats.lastWorkDate 
            ? `Останній запис: ${stats.lastWorkDate}` 
            : 'Немає записів робіт'}
        </Text>

        {onDelete && (
          <TouchableOpacity 
            onPress={() => {
              Alert.alert(
                'Видалити об\'єкт?',
                `Ви впевнені, що хочете видалити об'єкт «${project.name}» та всі пов'язані записи робіт? Цю дію неможливо скасувати.`,
                [
                  { text: 'Ні', style: 'cancel' },
                  { text: 'Так, видалити', style: 'destructive', onPress: () => onDelete(project.id) }
                ]
              );
            }}
            style={styles.deleteBtn}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleGroup: {
    flex: 1,
    paddingRight: 10,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  address: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  lastDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  deleteBtn: {
    padding: 4,
  },
});
