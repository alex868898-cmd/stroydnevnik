import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkItem } from '../../lib/types';
import { COLORS } from '../../lib/constants';
import { formatCurrency } from '../../lib/formatters';
import { supabase } from '../../services/supabase';

interface ReportItemTableProps {
  items: WorkItem[];
  onEditItem?: (index: number, updatedItem: WorkItem) => void;
  onDeleteItem?: (index: number) => void;
  onMoveItem?: (index: number) => void; // for splitting project
  editable?: boolean;
}

export const ReportItemTable: React.FC<ReportItemTableProps> = ({
  items,
  onEditItem,
  onDeleteItem,
  onMoveItem,
  editable = false,
}) => {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [actionText, setActionText] = useState('');
  const [volumeVal, setVolumeVal] = useState('');
  const [unitText, setUnitText] = useState('');
  const [priceVal, setPriceVal] = useState('');
  
  // Market stats states
  const [marketStats, setMarketStats] = useState<{ min: number; max: number; avg: number; samples: number } | null>(null);

  const fetchMarketStats = async (workType: string) => {
    if (!workType || workType.trim() === '') {
      setMarketStats(null);
      return;
    }
    
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('price_statistics')
        .select('price')
        .ilike('work_type', workType.trim())
        .gt('recorded_at', ninetyDaysAgoStr);

      if (error) throw error;

      if (data && data.length >= 3) {
        const prices = data.map(d => Number(d.price));
        const priceMin = Math.min(...prices);
        const priceMax = Math.max(...prices);
        const priceAvg = Math.round(prices.reduce((sum, val) => sum + val, 0) / prices.length);
        setMarketStats({
          min: priceMin,
          max: priceMax,
          avg: priceAvg,
          samples: prices.length
        });
      } else {
        setMarketStats(null);
      }
    } catch (err) {
      console.warn('Failed to load market statistics inside table:', err);
      setMarketStats(null);
    }
  };

  const startEdit = (index: number, item: WorkItem) => {
    setEditIndex(index);
    setActionText(item.action);
    setVolumeVal(item.volume !== null ? String(item.volume) : '');
    setUnitText(item.unit || '');
    setPriceVal(item.pricePerUnit !== null ? String(item.pricePerUnit) : '');
  };

  const saveEdit = () => {
    if (editIndex === null || !onEditItem) return;
    
    const volNum = volumeVal.trim() === '' ? null : parseFloat(volumeVal.replace(',', '.'));
    const priceNum = priceVal.trim() === '' ? null : parseFloat(priceVal.replace(',', '.'));

    if (actionText.trim() === '') {
      Alert.alert('Помилка', 'Найменування робіт не може бути порожнім');
      return;
    }

    if (volNum !== null && isNaN(volNum)) {
      Alert.alert('Помилка', 'Некоректне значення кількості');
      return;
    }

    if (priceNum !== null && isNaN(priceNum)) {
      Alert.alert('Помилка', 'Некоректне значення розцінки');
      return;
    }

    const currentItem = items[editIndex];
    const total = volNum !== null && priceNum !== null ? volNum * priceNum : null;

    onEditItem(editIndex, {
      action: actionText,
      workType: currentItem.workType,
      volume: volNum,
      unit: unitText,
      pricePerUnit: priceNum,
      total,
      priceFromCatalog: currentItem.priceFromCatalog,
    });

    closeEditModal();
  };

  const closeEditModal = () => {
    setEditIndex(null);
    setActionText('');
    setVolumeVal('');
    setUnitText('');
    setPriceVal('');
    setMarketStats(null);
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Немає доданих робіт</Text>
      </View>
    );
  }

  return (
    <View style={styles.table}>
      {/* Table Header */}
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.cell, styles.colName, styles.headerText]}>Найменування</Text>
        <Text style={[styles.cell, styles.colVolume, styles.headerText]}>К-сть</Text>
        <Text style={[styles.cell, styles.colUnit, styles.headerText]}>Од.</Text>
        <Text style={[styles.cell, styles.colPrice, styles.headerText]}>Ціна</Text>
        <Text style={[styles.cell, styles.colTotal, styles.headerText]}>Сума</Text>
        {editable && <View style={styles.colActions} />}
      </View>

      {/* Table Rows */}
      {items.map((item, index) => (
        <View 
          key={index} 
          style={[
            styles.row, 
            index % 2 === 0 ? styles.evenRow : styles.oddRow,
            item.volume === null && styles.pendingVolumeRow
          ]}
        >
          <Text style={[styles.cell, styles.colName, styles.cellText]} numberOfLines={2}>
            {item.action}
          </Text>
          <Text style={[styles.cell, styles.colVolume, styles.cellText, item.volume === null && styles.pendingText]}>
            {item.volume !== null ? item.volume : '?'}
          </Text>
          <Text style={[styles.cell, styles.colUnit, styles.cellText]}>
            {item.unit || '-'}
          </Text>
          <Text style={[styles.cell, styles.colPrice, styles.cellText]}>
            {item.pricePerUnit !== null ? Math.round(item.pricePerUnit) : '-'}
          </Text>
          <Text style={[styles.cell, styles.colTotal, styles.cellText, styles.boldText]}>
            {item.total !== null ? formatCurrency(item.total) : '-'}
          </Text>

          {editable && (
            <View style={styles.colActions}>
              <TouchableOpacity onPress={() => startEdit(index, item)} style={styles.actionBtn}>
                <Ionicons name="create-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
              
              {onMoveItem && (
                <TouchableOpacity onPress={() => onMoveItem(index)} style={styles.actionBtn}>
                  <Ionicons name="arrow-redo-outline" size={18} color={COLORS.warning} />
                </TouchableOpacity>
              )}
              
              {onDeleteItem && (
                <TouchableOpacity 
                  onPress={() => {
                    Alert.alert(
                      'Видалити роботу?',
                      `Ви впевнені, що хочете видалити «${item.action}»?`,
                      [
                        { text: 'Ні', style: 'cancel' },
                        { text: 'Так, видалити', style: 'destructive', onPress: () => onDeleteItem(index) }
                      ]
                    );
                  }}
                  style={styles.actionBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      ))}

      {/* Edit Modal */}
      <Modal
        visible={editIndex !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Редагувати роботу</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Найменування роботи</Text>
              <TextInput
                style={styles.input}
                value={actionText}
                onChangeText={setActionText}
                placeholder="Напр. Шпаклівка стін"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.rowInputContainer}>
              <View style={[styles.formGroup, { flex: 2, marginRight: 10 }]}>
                <Text style={styles.label}>Кількість</Text>
                <TextInput
                  style={styles.input}
                  value={volumeVal}
                  onChangeText={setVolumeVal}
                  keyboardType="numeric"
                  placeholder="Вкажіть об'єм"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>Одиниця</Text>
                <TextInput
                  style={styles.input}
                  value={unitText}
                  onChangeText={setUnitText}
                  placeholder="м², п.м..."
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Розцінка (грн)</Text>
              <TextInput
                style={styles.input}
                value={priceVal}
                onChangeText={setPriceVal}
                keyboardType="numeric"
                placeholder="Ціна за одиницю"
                placeholderTextColor={COLORS.textMuted}
                onFocus={() => fetchMarketStats(actionText)}
              />
              {marketStats && marketStats.samples >= 3 && (
                <Text style={styles.marketHint}>
                  Ринок: від {marketStats.min} до {marketStats.max} грн (середня {marketStats.avg} грн)
                </Text>
              )}
            </View>

            <View style={styles.modalActions}>
              {onDeleteItem && (
                <TouchableOpacity 
                  style={[styles.cancelBtn, { marginRight: 'auto', paddingHorizontal: 0 }]} 
                  onPress={() => {
                    Alert.alert(
                      'Видалити роботу?',
                      `Ви впевнені, що хочете видалити «${actionText}»?`,
                      [
                        { text: 'Ні', style: 'cancel' },
                        { 
                          text: 'Так, видалити', 
                          style: 'destructive', 
                          onPress: () => {
                            onDeleteItem(editIndex!);
                            closeEditModal();
                          } 
                        }
                      ]
                    );
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontSize: 14, fontWeight: 'bold' }}>Видалити позицію</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelBtn} onPress={closeEditModal}>
                <Text style={styles.cancelBtnText}>Скасувати</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                <Text style={styles.saveBtnText}>Зберегти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  table: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: 'hidden',
    marginBottom: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  headerRow: {
    backgroundColor: COLORS.cardBorder,
  },
  evenRow: {
    backgroundColor: COLORS.card,
  },
  oddRow: {
    backgroundColor: '#1E293B80', // Translucent overlay
  },
  pendingVolumeRow: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  headerText: {
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  cellText: {
    color: COLORS.text,
    fontSize: 13,
  },
  boldText: {
    fontWeight: 'bold',
  },
  pendingText: {
    color: COLORS.warning,
    fontWeight: 'bold',
  },
  cell: {
    justifyContent: 'center',
  },
  colName: {
    flex: 4,
    paddingRight: 5,
  },
  colVolume: {
    flex: 1.5,
    textAlign: 'right',
    paddingRight: 5,
  },
  colUnit: {
    flex: 1.2,
    textAlign: 'center',
  },
  colPrice: {
    flex: 1.8,
    textAlign: 'right',
    paddingRight: 5,
  },
  colTotal: {
    flex: 2.5,
    textAlign: 'right',
  },
  colActions: {
    width: 65,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
  },
  actionBtn: {
    padding: 4,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 16,
  },
  rowInputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  marketHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
});
