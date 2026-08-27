import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProjects } from '../../hooks/useProjects';
import { supabase } from '../../services/supabase';
import { getDateRange, PeriodType, DateRange } from '../../lib/dateRange';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { COLORS } from '../../lib/constants';
import { ReportItemTable } from '../../components/pdf/ReportItemTable';
import { generateReportPDF } from '../../services/pdf';
import { generateReportCSV } from '../../services/excel';
import { shareReportFile } from '../../services/shareReport';
import { Project, WorkLog, WorkItem, EstimateHistory } from '../../lib/types';
import { calculateItemsTotal } from '../../lib/workLogUtils';
import { TopTabBar } from '../../components/navigation/TopTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateWheelPicker } from '../../components/date/DateWheelPicker';
import { getContractorProfile } from '../../services/contractorProfile';
import { getReceiptImages } from '../../services/receipts';
import { getPriceRange } from '../../services/priceKnowledge';

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromLocalDateString = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day, 12) : new Date();
};

interface EstimateDisplayItem {
  logId: string;
  itemIndex: number;
  item: WorkItem;
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { projects, loading: loadingProjects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // Period Filtering
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [pickerStart, setPickerStart] = useState(new Date());
  const [pickerEnd, setPickerEnd] = useState(new Date());
  const [activeDatePicker, setActiveDatePicker] = useState<'start' | 'end'>('start');

  // Data States
  const [loadingData, setLoadingData] = useState(false);
  const [latestEstimate, setLatestEstimate] = useState<EstimateHistory | null>(null);
  const [rawLogs, setRawLogs] = useState<WorkLog[]>([]);
  const [estimateItems, setEstimateItems] = useState<EstimateDisplayItem[]>([]);

  // Manual Position Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [action, setAction] = useState('');
  const [volume, setVolume] = useState('');
  const [unit, setUnit] = useState('м²');
  const [manualItemType, setManualItemType] = useState<'work' | 'material'>('work');
  const [price, setPrice] = useState('');
  const [adding, setAdding] = useState(false);

  // market price hint states for manual position
  const [marketStats, setMarketStats] = useState<{ min: number; max: number; avg: number; samples: number } | null>(null);

  // Compute active date range
  const dateRange = useMemo(() => {
    return getDateRange(periodType, customStart, customEnd);
  }, [periodType, customStart, customEnd]);

  // Business Rule: Only show active projects in Reports
  const activeProjects = useMemo(() => {
    return projects.filter(p => p.status === 'active');
  }, [projects]);

  useEffect(() => {
    if (activeProjects.length > 0) {
      if (!selectedProjectId || !activeProjects.some(p => p.id === selectedProjectId)) {
        setSelectedProjectId(activeProjects[0].id);
      }
    } else {
      setSelectedProjectId(null);
    }
  }, [activeProjects, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      loadReportData();
    } else {
      setRawLogs([]);
      setEstimateItems([]);
    }
  }, [selectedProjectId, dateRange]);

  const loadReportData = async () => {
    if (!selectedProjectId) return;
    setLoadingData(true);
    try {
      // 1. Fetch latest estimate history for auditing/tracking purposes
      const { data: estData, error: estErr } = await supabase
        .from('estimate_history')
        .select('*')
        .eq('project_id', selectedProjectId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (estErr) throw estErr;
      const latestEst = estData && estData.length > 0 ? (estData[0] as EstimateHistory) : null;
      setLatestEstimate(latestEst);

      // 2. Fetch all work logs for the project in this period
      let query = supabase
        .from('work_logs')
        .select('*')
        .eq('project_id', selectedProjectId)
        .eq('is_day_off', false)
        .gte('work_date', dateRange.startDate)
        .lte('work_date', dateRange.endDate)
        .order('work_date', { ascending: true });

      const { data: logsData, error: logsErr } = await query;
      if (logsErr) throw logsErr;

      const logs = (logsData || []) as WorkLog[];
      setRawLogs(logs);

      // 3. Business Rule: After PDF/Excel export, works do NOT disappear. 
      // We show ALL logs for the date range without filtering them by estimate_history.
      const filteredLogs = logs;

      // 4. Flatten work items into a display structure keeping track of source log
      const items: EstimateDisplayItem[] = [];
      filteredLogs.forEach(log => {
        log.work_items.forEach((item, index) => {
          items.push({
            logId: log.id,
            itemIndex: index,
            item
          });
        });
      });

      setEstimateItems(items);
    } catch (e) {
      console.error('Failed to load report data:', e);
      Alert.alert('Помилка', 'Не вдалося завантажити дані для кошторису');
    } finally {
      setLoadingData(false);
    }
  };

  const handleEditItem = async (index: number, updatedItem: WorkItem) => {
    const displayItem = estimateItems[index];
    const originalLog = rawLogs.find(l => l.id === displayItem.logId);
    if (!originalLog) return;

    // Update items array of the log
    const updatedItems = [...originalLog.work_items];
    updatedItems[displayItem.itemIndex] = updatedItem;

    try {
      const totalAmount = calculateItemsTotal(updatedItems);
      await supabase
        .from('work_logs')
        .update({ work_items: updatedItems, total_amount: totalAmount })
        .eq('id', displayItem.logId);
      
      // Reload UI
      await loadReportData();
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося зберегти зміни');
    }
  };

  const handleDeleteItem = async (index: number) => {
    const displayItem = estimateItems[index];
    const originalLog = rawLogs.find(l => l.id === displayItem.logId);
    if (!originalLog) return;

    const updatedItems = originalLog.work_items.filter((_, idx) => idx !== displayItem.itemIndex);
    
    try {
      if (updatedItems.length === 0) {
        // Delete entire log if no items left
        await supabase.from('work_logs').delete().eq('id', displayItem.logId);
      } else {
        const totalAmount = calculateItemsTotal(updatedItems);
        await supabase
          .from('work_logs')
          .update({ work_items: updatedItems, total_amount: totalAmount })
          .eq('id', displayItem.logId);
      }
      // Reload UI
      await loadReportData();
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося видалити позицію');
    }
  };

  // Fetch market statistics for a given work name
  const fetchMarketStats = async (workType: string) => {
    if (!workType || workType.trim() === '') {
      setMarketStats(null);
      return;
    }
    
    try {
      setMarketStats(await getPriceRange(workType));
    } catch (err) {
      console.warn('Failed to load market statistics inside reports:', err);
      setMarketStats(null);
    }
  };

  /**
   * Business Rule: «+ Додати позицію» — новая строка → сохраняется в work_logs
   */
  const handleAddManualPosition = async () => {
    if (!selectedProjectId) return;
    if (action.trim() === '' || volume.trim() === '' || price.trim() === '') {
      Alert.alert('Помилка', 'Будь ласка, заповніть всі поля');
      return;
    }

    const volNum = parseFloat(volume.replace(',', '.'));
    const priceNum = parseFloat(price.replace(',', '.'));

    if (isNaN(volNum) || isNaN(priceNum)) {
      Alert.alert('Помилка', 'Введіть коректні числа для кількості та розцінки');
      return;
    }

    setAdding(true);
    try {
      const newWorkItem: WorkItem = {
        itemType: manualItemType,
        action: action.trim(),
        workType: action.trim(),
        volume: volNum,
        unit: unit,
        pricePerUnit: priceNum,
        total: volNum * priceNum,
        priceFromCatalog: false
      };

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      // Save a new log representing this manual estimate position (explicitly pass user_id for RLS check)
      await supabase.from('work_logs').insert([{
        project_id: selectedProjectId,
        work_date: dateRange.endDate, // Save at the end date of the period
        voice_transcript: '__estimate_only__', // Special transcript marker
        work_items: [newWorkItem],
        total_amount: newWorkItem.total,
        volumes_confirmed: true,
        is_day_off: false,
        user_id: userId
      }]);

      setAction('');
      setManualItemType('work');
      setVolume('');
      setPrice('');
      setMarketStats(null);
      setShowAddModal(false);
      Alert.alert('Додано', 'Позицію успішно додано до кошторису');
      loadReportData();
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося додати позицію');
    } finally {
      setAdding(false);
    }
  };

  const handleExport = async (type: 'pdf' | 'excel') => {
    if (!selectedProjectId || estimateItems.length === 0) {
      Alert.alert('Помилка', 'Немає позицій для експорту');
      return;
    }

    const project = activeProjects.find(p => p.id === selectedProjectId);
    if (!project) return;
    const items = estimateItems.map(d => d.item);
    const totalAmount = items.reduce((acc, i) => acc + (i.total || 0), 0);

    setLoadingData(true);
    try {
      let fileUri = '';
      let mimeType = '';

      if (type === 'pdf') {
        const contractor = await getContractorProfile();
        const receiptImages = await getReceiptImages(selectedProjectId, dateRange.startDate, dateRange.endDate);
        fileUri = await generateReportPDF({
          project,
          periodStart: dateRange.startDate,
          periodEnd: dateRange.endDate,
          items,
          totalAmount,
          contractor,
          receiptImages,
        });
        mimeType = 'application/pdf';
      } else {
        fileUri = await generateReportCSV({
          project,
          periodStart: dateRange.startDate,
          periodEnd: dateRange.endDate,
          items,
          totalAmount
        });
        mimeType = 'text/csv';
      }

      // Save this export in estimate_history for audit trail / tracking
      const newestLogId = rawLogs.length > 0 ? rawLogs[rawLogs.length - 1].id : null;
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      await supabase.from('estimate_history').insert([{
        project_id: selectedProjectId,
        last_work_log_id: newestLogId,
        period_start: dateRange.startDate,
        period_end: dateRange.endDate,
        user_id: userId
      }]);

      // Bulk insert price statistics anonymously (no user_id!)
      const statsPayload = items.map(item => ({
        work_type: item.action,
        price: item.pricePerUnit || 0,
        region: 'ukraine',
        recorded_at: new Date().toISOString().split('T')[0]
      }));
      
      if (statsPayload.length > 0) {
        const { error: statsErr } = await supabase
          .from('price_statistics')
          .insert(statsPayload);
        if (statsErr) {
          console.error('Error saving price statistics:', statsErr);
        }
      }

      // Open Native Sharing sheet
      await shareReportFile(fileUri, mimeType, `Кошторис ${project.name}`);
      
      // Reload UI to refresh any state, but items will NOT disappear
      loadReportData();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        'Помилка експорту',
        e?.message || 'Не вдалося згенерувати або надіслати файл'
      );
    } finally {
      setLoadingData(false);
    }
  };

  const openCustomDatePicker = () => {
    setPickerStart(fromLocalDateString(customStart || dateRange.startDate));
    setPickerEnd(fromLocalDateString(customEnd || dateRange.endDate));
    setActiveDatePicker('start');
    setShowCustomModal(true);
  };

  const handleApplyCustomDates = () => {
    if (pickerStart > pickerEnd) {
      Alert.alert('Помилка', 'Початкова дата не може бути більшою за кінцеву');
      return;
    }
    setCustomStart(toLocalDateString(pickerStart));
    setCustomEnd(toLocalDateString(pickerEnd));
    setPeriodType('custom');
    setShowCustomModal(false);
  };

  const totalAmount = useMemo(() => {
    return estimateItems.reduce((acc, d) => acc + (d.item.total || 0), 0);
  }, [estimateItems]);

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Експорт та звіти</Text>
          <Text style={styles.headerTitle}>Кошториси робіт</Text>
        </View>
      </View>

      <TopTabBar />

      {/* Period Filter Buttons */}
      <View style={styles.filterSection}>
        <TouchableOpacity
          style={[styles.filterBtn, periodType === 'week' && styles.filterBtnActive]}
          onPress={() => setPeriodType('week')}
        >
          <Text style={[styles.filterBtnText, periodType === 'week' && styles.filterBtnTextActive]}>
            За тиждень
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterBtn, periodType === 'month' && styles.filterBtnActive]}
          onPress={() => setPeriodType('month')}
        >
          <Text style={[styles.filterBtnText, periodType === 'month' && styles.filterBtnTextActive]}>
            За місяць
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, periodType === 'custom' && styles.filterBtnActive]}
          onPress={openCustomDatePicker}
        >
          <Text style={[styles.filterBtnText, periodType === 'custom' && styles.filterBtnTextActive]}>
            Період...
          </Text>
        </TouchableOpacity>
      </View>

      {/* Current Range Label */}
      <View style={styles.rangeInfo}>
        <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
        <Text style={styles.rangeInfoText}>
          {formatDate(dateRange.startDate)} — {formatDate(dateRange.endDate)}
        </Text>
      </View>

      {/* Project Selector dropdown */}
      <View style={styles.selectorWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorContainer}>
          {loadingProjects ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : activeProjects.length === 0 ? (
            <Text style={{ color: COLORS.textSecondary, alignSelf: 'center' }}>Немає активних об'єктів</Text>
          ) : (
            activeProjects.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.projectTag,
                  selectedProjectId === p.id && styles.projectTagActive
                ]}
                onPress={() => setSelectedProjectId(p.id)}
              >
                <Text style={[styles.projectTagText, selectedProjectId === p.id && styles.projectTagTextActive]}>
                  🏢 {p.name}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>

      {/* Main Billing Table Section */}
      <View style={styles.billingSection}>
        <View style={styles.billingHeader}>
          <Text style={styles.billingTitle}>Позиції в кошторисі</Text>
          <TouchableOpacity 
            style={styles.addPositionBtn} 
            onPress={() => setShowAddModal(true)}
            disabled={!selectedProjectId}
          >
            <Ionicons name="add" size={16} color={COLORS.primary} style={{ marginRight: 2 }} />
            <Text style={styles.addPositionBtnText}>Додати позицію</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.tableScroll}>
          {loadingData ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
          ) : estimateItems.length === 0 ? (
            <View style={styles.emptyTable}>
              <Ionicons name="receipt-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTableText}>Немає робіт за цей період</Text>
            </View>
          ) : (
            <ReportItemTable
              items={estimateItems.map(d => d.item)}
              editable
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
            />
          )}
        </ScrollView>
      </View>

      {/* Export / Sharing Action Bar at Bottom */}
      <View style={[styles.exportBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Всього до виплати:</Text>
          <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[styles.exportBtn, styles.excelBtn]} 
            onPress={() => handleExport('excel')}
            disabled={estimateItems.length === 0}
          >
            <Ionicons name="document-text" size={20} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.exportBtnText}>Excel (CSV)</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.exportBtn, styles.pdfBtn]} 
            onPress={() => handleExport('pdf')}
            disabled={estimateItems.length === 0}
          >
            <Ionicons name="document" size={20} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.exportBtnText}>Експорт PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Manual Position Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Додати позицію вручну</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Тип позиції</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['work', 'material'] as const).map(type => (
                  <TouchableOpacity key={type} onPress={() => setManualItemType(type)} style={{ flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: manualItemType === type ? COLORS.primary : COLORS.cardBorder, backgroundColor: manualItemType === type ? COLORS.primary : COLORS.background }}>
                    <Text style={{ color: manualItemType === type ? '#fff' : COLORS.textSecondary, fontWeight: '700' }}>{type === 'work' ? 'Робота' : 'Матеріал'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Найменування роботи</Text>
              <TextInput
                style={styles.input}
                value={action}
                onChangeText={setAction}
                placeholder="Напр. Додаткове шліфування стін"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.formGroup, { flex: 2, marginRight: 10 }]}>
                <Text style={styles.label}>Кількість</Text>
                <TextInput
                  style={styles.input}
                  value={volume}
                  onChangeText={setVolume}
                  keyboardType="numeric"
                  placeholder="Об'єм"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>Одиниця</Text>
                <TextInput
                  style={styles.input}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="м², шт..."
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Розцінка (грн)</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholder="Вартість одиниці"
                placeholderTextColor={COLORS.textMuted}
                onFocus={() => fetchMarketStats(action)}
              />
              {marketStats && (
                <Text style={styles.marketHint}>
                  За внутрішньою базою: {marketStats.min}–{marketStats.max} грн. Рекомендуємо {marketStats.max} грн або середню {marketStats.avg} грн.
                </Text>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => {
                  setShowAddModal(false);
                  setAction('');
                  setVolume('');
                  setPrice('');
                  setMarketStats(null);
                }}
                disabled={adding}
              >
                <Text style={styles.cancelBtnText}>Скасувати</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.saveBtn} 
                onPress={handleAddManualPosition}
                disabled={adding}
              >
                {adding ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Додати</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Period Picker Modal */}
      <Modal
        visible={showCustomModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Оберіть довільний період</Text>

            <View style={styles.dateTabs}>
              <TouchableOpacity
                style={[styles.dateTab, activeDatePicker === 'start' && styles.dateTabActive]}
                onPress={() => setActiveDatePicker('start')}
              >
                <Text style={styles.dateTabLabel}>Початок</Text>
                <Text style={styles.dateTabValue}>{formatDate(pickerStart)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateTab, activeDatePicker === 'end' && styles.dateTabActive]}
                onPress={() => setActiveDatePicker('end')}
              >
                <Text style={styles.dateTabLabel}>Кінець</Text>
                <Text style={styles.dateTabValue}>{formatDate(pickerEnd)}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.datePickerHint}>Прокручуйте день, місяць і рік або натискайте стрілки</Text>
            <DateWheelPicker
              value={activeDatePicker === 'start' ? pickerStart : pickerEnd}
              onChange={activeDatePicker === 'start' ? setPickerStart : setPickerEnd}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => setShowCustomModal(false)}
              >
                <Text style={styles.cancelBtnText}>Скасувати</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.saveBtn} 
                onPress={handleApplyCustomDates}
              >
                <Text style={styles.saveBtnText}>Застосувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    height: 116,
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  
  // Period filter
  filterSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 10,
  },
  filterBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  filterBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  dateTabs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  dateTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  dateTabActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '18',
  },
  dateTabLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 2,
  },
  dateTabValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  datePickerHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
  rangeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  rangeInfoText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },

  // Project selector
  selectorWrapper: {
    height: 40,
    marginBottom: 20,
  },
  selectorContainer: {
    paddingHorizontal: 20,
    gap: 10,
  },
  projectTag: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
  },
  projectTagActive: {
    backgroundColor: COLORS.cardBorder,
    borderColor: COLORS.primary,
  },
  projectTagText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  projectTagTextActive: {
    color: COLORS.primary,
  },

  // Billing table
  billingSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  billingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  billingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  addPositionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  addPositionBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  tableScroll: {
    flex: 1,
  },
  emptyTable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTableText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // Export Bar
  exportBar: {
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    padding: 20,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excelBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  pdfBtn: {
    backgroundColor: COLORS.primary,
  },
  exportBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // Modals
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
  rowInputs: {
    flexDirection: 'row',
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
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
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
