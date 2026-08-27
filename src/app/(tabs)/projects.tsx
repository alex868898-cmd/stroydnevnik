import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProjects } from '../../hooks/useProjects';
import { ProjectCard } from '../../components/projects/ProjectCard';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../services/supabase';
import { ProjectStatus, getStatusInfo } from '../../lib/projectStatus';
import { formatDate, formatCurrency } from '../../lib/formatters';
import { WorkLog, WorkItem, Project } from '../../lib/types';
import { ReportItemTable } from '../../components/pdf/ReportItemTable';
import { calculateItemsTotal } from '../../lib/workLogUtils';
import { TopTabBar } from '../../components/navigation/TopTabBar';

interface DrillDownItem {
  logId: string;
  itemIndex: number;
  item: WorkItem;
}

export default function ProjectsScreen() {
  const { projects, loading: loadingProjects, addProject, changeStatus, removeProject } = useProjects();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // Statistics for projects list
  const [stats, setStats] = useState<Record<string, { totalAmount: number; logCount: number; lastWorkDate: string | null }>>({});
  const [loadingStats, setLoadingStats] = useState(true);

  // Drill-down State
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectLogs, setProjectLogs] = useState<WorkLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Drill-down Add Modal
  const [showAddWorkModal, setShowAddWorkModal] = useState(false);

  // Form states for history work items
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
  const [workAction, setWorkAction] = useState('');
  const [workVolume, setWorkVolume] = useState('');
  const [workUnit, setWorkUnit] = useState('м²');
  const [workPrice, setWorkPrice] = useState('');
  const [savingWork, setSavingWork] = useState(false);

  // Market stats hint states for manual position
  const [marketStats, setMarketStats] = useState<{ min: number; max: number; avg: number; samples: number } | null>(null);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const { data, error } = await supabase
        .from('work_logs')
        .select('project_id, total_amount, work_date')
        .eq('is_day_off', false);
        
      if (error) throw error;
      
      const agg: Record<string, { totalAmount: number; logCount: number; lastWorkDate: string | null }> = {};
      
      if (data) {
        data.forEach(log => {
          const pid = log.project_id || 'unassigned';
          if (!agg[pid]) {
            agg[pid] = { totalAmount: 0, logCount: 0, lastWorkDate: null };
          }
          agg[pid].totalAmount += Number(log.total_amount || 0);
          agg[pid].logCount += 1;
          
          if (log.work_date) {
            const dateStr = formatDate(log.work_date);
            if (!agg[pid].lastWorkDate || log.work_date > (agg[pid].lastWorkDate || '')) {
              agg[pid].lastWorkDate = dateStr;
            }
          }
        });
      }
      setStats(agg);
    } catch (e) {
      console.error('Failed to load project stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [projects]);

  // Fetch history for a project when drilling down
  const fetchProjectLogs = async (projectId: string) => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('work_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('work_date', { ascending: false });
      
      if (error) throw error;
      setProjectLogs(data || []);
    } catch (e) {
      console.error('Failed to load project logs:', e);
      Alert.alert('Помилка', 'Не вдалося завантажити історію робіт');
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleProjectPress = (project: Project) => {
    setSelectedProject(project);
    fetchProjectLogs(project.id);
  };

  const handleBackToList = () => {
    setSelectedProject(null);
    setProjectLogs([]);
    fetchStats();
  };

  // Group items by date for the drill-down history view
  const groupedDrillDownItems = useMemo(() => {
    const groups: Record<string, DrillDownItem[]> = {};
    projectLogs.forEach(log => {
      if (log.is_day_off) return; // Skip day off log entries in history list
      const dateKey = log.work_date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      log.work_items.forEach((item, index) => {
        groups[dateKey].push({
          logId: log.id,
          itemIndex: index,
          item
        });
      });
    });
    return groups;
  }, [projectLogs]);

  const handleAddProject = async () => {
    if (name.trim() === '') {
      Alert.alert('Помилка', 'Назва об\'єкту обов\'язкова');
      return;
    }

    setSaving(true);
    try {
      await addProject(name, address.trim() === '' ? undefined : address);
      setName('');
      setAddress('');
      setShowAddModal(false);
      Alert.alert('Створено', 'Новий об\'єкт успішно додано!');
      fetchStats();
    } catch (err) {
      Alert.alert('Помилка', 'Не вдалося створити об\'єкт');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: ProjectStatus) => {
    try {
      await changeStatus(id, status);
      // Sync local state if currently drilled down
      if (selectedProject && selectedProject.id === id) {
        setSelectedProject(prev => prev ? { ...prev, status } : null);
      }
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося змінити статус');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await removeProject(id);
      Alert.alert('Видалено', 'Об\'єкт успішно вилучено!');
      if (selectedProject?.id === id) {
        handleBackToList();
      }
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося видалити об\'єкт');
    }
  };

  // Fetch market statistics for a given work name
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
      console.warn('Failed to load market statistics inside projects:', err);
      setMarketStats(null);
    }
  };

  // Add work item directly to history
  const handleAddWorkItem = async () => {
    if (!selectedProject) return;
    if (workAction.trim() === '' || workVolume.trim() === '' || workPrice.trim() === '') {
      Alert.alert('Помилка', 'Заповніть усі обов\'язкові поля');
      return;
    }

    const volNum = parseFloat(workVolume.replace(',', '.'));
    const priceNum = parseFloat(workPrice.replace(',', '.'));

    if (isNaN(volNum) || isNaN(priceNum)) {
      Alert.alert('Помилка', 'Кількість та ціна повинні бути числами');
      return;
    }

    setSavingWork(true);
    try {
      const newItem: WorkItem = {
        action: workAction.trim(),
        workType: workAction.trim(),
        volume: volNum,
        unit: workUnit,
        pricePerUnit: priceNum,
        total: volNum * priceNum,
        priceFromCatalog: false
      };

      // Explicitly get user details to satisfy RLS verification policies
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      // Check if a work_log already exists for this date and project
      const existingLog = projectLogs.find(l => l.work_date === workDate);

      if (existingLog) {
        // Append to existing log
        const updatedItems = [...existingLog.work_items, newItem];
        const newTotal = calculateItemsTotal(updatedItems);
        
        const { error } = await supabase
          .from('work_logs')
          .update({ 
            work_items: updatedItems, 
            total_amount: newTotal,
            volumes_confirmed: true 
          })
          .eq('id', existingLog.id);
          
        if (error) throw error;
      } else {
        // Create a new work_log
        const { error } = await supabase
          .from('work_logs')
          .insert([{
            project_id: selectedProject.id,
            work_date: workDate,
            voice_transcript: 'Додано вручну до кошторису',
            work_items: [newItem],
            total_amount: newItem.total,
            volumes_confirmed: true,
            is_day_off: false,
            user_id: userId
          }]);
          
        if (error) throw error;
      }

      // Reset Form and Reload
      setWorkAction('');
      setWorkVolume('');
      setWorkPrice('');
      setMarketStats(null);
      setShowAddWorkModal(false);
      Alert.alert('Успішно', 'Роботу додано до історії!');
      await fetchProjectLogs(selectedProject.id);
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося зберегти запис');
    } finally {
      setSavingWork(false);
    }
  };

  // Delete work item in history list
  const handleDeleteWorkItem = async (logId: string, itemIndex: number) => {
    if (!selectedProject) return;
    const log = projectLogs.find(l => l.id === logId);
    if (!log) return;

    const updatedItems = log.work_items.filter((_, idx) => idx !== itemIndex);

    try {
      if (updatedItems.length === 0) {
        // If it was the last item, remove the log completely
        const { error } = await supabase.from('work_logs').delete().eq('id', logId);
        if (error) throw error;
      } else {
        const newTotal = calculateItemsTotal(updatedItems);
        const { error } = await supabase
          .from('work_logs')
          .update({ work_items: updatedItems, total_amount: newTotal })
          .eq('id', logId);
        if (error) throw error;
      }

      Alert.alert('Видалено', 'Позицію вилучено з історії');
      await fetchProjectLogs(selectedProject.id);
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося видалити позицію');
    }
  };

  // Drill-down View
  if (selectedProject) {
    const statusInfo = getStatusInfo(selectedProject.status);
    const dateKeys = Object.keys(groupedDrillDownItems).sort((a, b) => b.localeCompare(a));

    return (
      <View style={styles.container}>
        {/* Drill-down Header */}
        <View style={styles.drillHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBackToList}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} style={{ marginRight: 6 }} />
            <Text style={styles.backBtnText}>Назад</Text>
          </TouchableOpacity>
          <Text style={styles.drillHeaderTitle} numberOfLines={1}>Історія робіт</Text>
        </View>

        {/* Project Meta Info */}
        <View style={styles.projectMetaCard}>
          <View style={styles.metaRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaProjectName}>{selectedProject.name}</Text>
              {selectedProject.address && (
                <Text style={styles.metaProjectAddress}>📍 {selectedProject.address}</Text>
              )}
            </View>
            <TouchableOpacity 
              style={[styles.statusBadge, { backgroundColor: statusInfo.color + '15', borderColor: statusInfo.color }]}
              onPress={() => {
                Alert.alert(
                  'Змінити статус об\'єкту',
                  'Оберіть новий статус:',
                  [
                    { text: '🟢 – Активний', onPress: () => handleStatusChange(selectedProject.id, 'active') },
                    { text: '⏸ – Призупинений', onPress: () => handleStatusChange(selectedProject.id, 'paused') },
                    { text: '❄️ – Заморожений', onPress: () => handleStatusChange(selectedProject.id, 'frozen') },
                    { text: '✅ – Завершений', onPress: () => handleStatusChange(selectedProject.id, 'completed') },
                    { text: 'Скасувати', style: 'cancel' }
                  ]
                );
              }}
            >
              <Text style={{ color: statusInfo.color, fontSize: 12, fontWeight: 'bold' }}>
                {statusInfo.emoji} {statusInfo.label}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Drill-down Action Toolbar */}
        <View style={styles.drillActions}>
          <Text style={styles.drillSectionTitle}>Виконані роботи по днях</Text>
          <TouchableOpacity 
            style={styles.addWorkBtn} 
            onPress={() => {
              setWorkDate(new Date().toISOString().split('T')[0]);
              setShowAddWorkModal(true);
            }}
          >
            <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.addWorkBtnText}>Додати роботу</Text>
          </TouchableOpacity>
        </View>

        {/* History Grouped List */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {loadingLogs ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
          ) : dateKeys.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={44} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Історія робіт порожня</Text>
              <Text style={styles.emptySubtitle}>Натисніть кнопку «Додати роботу» для ручного введення позиції.</Text>
            </View>
          ) : (
            dateKeys.map(dateKey => {
              const displayItems = groupedDrillDownItems[dateKey];
              return (
                <View key={dateKey} style={styles.dateGroupCard}>
                  <View style={styles.dateGroupHeaderRow}>
                    <Text style={styles.dateGroupHeader}>📅 {formatDate(dateKey, 'full')}</Text>
                    <TouchableOpacity 
                      style={styles.addPositionBtn} 
                      onPress={() => {
                        setWorkDate(dateKey);
                        setShowAddWorkModal(true);
                      }}
                    >
                      <Ionicons name="add" size={14} color={COLORS.primary} style={{ marginRight: 2 }} />
                      <Text style={styles.addPositionBtnText}>Додати позицію</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Table Layout */}
                  <ReportItemTable
                    items={displayItems.map(di => di.item)}
                    editable
                    onEditItem={async (idx, updatedItem) => {
                      const di = displayItems[idx];
                      const log = projectLogs.find(l => l.id === di.logId);
                      if (!log) return;

                      const updatedItems = [...log.work_items];
                      updatedItems[di.itemIndex] = updatedItem;
                      const newTotal = calculateItemsTotal(updatedItems);

                      try {
                        const { error } = await supabase
                          .from('work_logs')
                          .update({ work_items: updatedItems, total_amount: newTotal })
                          .eq('id', di.logId);
                        if (error) throw error;
                        Alert.alert('Збережено', 'Роботу відредаговано!');
                        await fetchProjectLogs(selectedProject.id);
                      } catch (e) {
                        Alert.alert('Помилка', 'Не вдалося відредагувати запис');
                      }
                    }}
                    onDeleteItem={(idx) => handleDeleteWorkItem(displayItems[idx].logId, displayItems[idx].itemIndex)}
                  />
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Add Work Modal */}
        <Modal
          visible={showAddWorkModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddWorkModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Додати роботу в історію</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Дата (РРРР-ММ-ДД)</Text>
                <TextInput
                  style={styles.input}
                  value={workDate}
                  onChangeText={setWorkDate}
                  placeholder="2026-06-19"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Найменування роботи</Text>
                <TextInput
                  style={styles.input}
                  value={workAction}
                  onChangeText={setWorkAction}
                  placeholder="Напр. Штукатурка стін"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              <View style={styles.rowInputs}>
                <View style={[styles.formGroup, { flex: 2, marginRight: 10 }]}>
                  <Text style={styles.label}>Кількість</Text>
                  <TextInput
                    style={styles.input}
                    value={workVolume}
                    onChangeText={setWorkVolume}
                    keyboardType="numeric"
                    placeholder="Об'єм"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Одиниця</Text>
                  <TextInput
                    style={styles.input}
                    value={workUnit}
                    onChangeText={setWorkUnit}
                    placeholder="м²"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Розцінка (грн)</Text>
                <TextInput
                  style={styles.input}
                  value={workPrice}
                  onChangeText={setWorkPrice}
                  keyboardType="numeric"
                  placeholder="Вартість за одиницю"
                  placeholderTextColor={COLORS.textMuted}
                  onFocus={() => fetchMarketStats(workAction)}
                />
                {marketStats && marketStats.samples >= 3 && (
                  <Text style={styles.marketHint}>
                    Ринок: від {marketStats.min} до {marketStats.max} грн (середня {marketStats.avg} грн)
                  </Text>
                )}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={styles.cancelBtn} 
                  onPress={() => {
                    setShowAddWorkModal(false);
                    setWorkAction('');
                    setWorkVolume('');
                    setWorkPrice('');
                    setMarketStats(null);
                  }}
                  disabled={savingWork}
                >
                  <Text style={styles.cancelBtnText}>Скасувати</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.saveBtn} 
                  onPress={handleAddWorkItem}
                  disabled={savingWork}
                >
                  {savingWork ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Додати</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Project List View (Default)
  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Перелік об'єктів</Text>
          <Text style={styles.headerTitle}>Мої проєкти</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add-circle" size={32} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <TopTabBar />

      {/* Projects List */}
      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loadingProjects || loadingStats ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
        ) : projects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Жодного об'єкту</Text>
            <Text style={styles.emptySubtitle}>Створіть свій перший об'єкт за допомогою кнопки (+) зверху.</Text>
          </View>
        ) : (
          projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              stats={stats[project.id]}
              onPress={() => handleProjectPress(project)}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteProject}
            />
          ))
        )}
      </ScrollView>

      {/* Create Project Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Новий об'єкт будівництва</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Назва об'єкту (обов'язково)</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Напр. ЖК Шевченківський"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Адреса (необов'язково)</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="вул. Шевченка, буд. 12"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => {
                  setShowAddModal(false);
                  setName('');
                  setAddress('');
                }}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Скасувати</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.saveBtn} 
                onPress={handleAddProject}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Створити</Text>
                )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
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
  addBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
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
    paddingHorizontal: 40,
  },
  
  // Drill-down Header styles
  drillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: COLORS.cardBorder,
  },
  backBtnText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  drillHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  projectMetaCard: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaProjectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  metaProjectAddress: {
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
  drillActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  drillSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  addWorkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addWorkBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  dateGroupCard: {
    backgroundColor: COLORS.card + '30',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
    marginBottom: 16,
  },
  dateGroupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateGroupHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  addPositionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addPositionBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Modal Style
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
  rowInputs: {
    flexDirection: 'row',
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
