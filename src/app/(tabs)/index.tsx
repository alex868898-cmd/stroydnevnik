import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProjects } from '../../hooks/useProjects';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { useEditWorkItem } from '../../hooks/useEditWorkItem';
import { runVoicePipeline, saveParsedSegments } from '../../services/voicePipeline';
import { getPriceCatalog } from '../../services/supabase';
import { formatCurrency } from '../../lib/formatters';
import { COLORS, STORAGE_KEYS } from '../../lib/constants';
import { VoiceRecorder } from '../../components/voice/VoiceRecorder';
import { ClarificationModal } from '../../components/voice/ClarificationModal';
import { ReportItemTable } from '../../components/pdf/ReportItemTable';
import { SettingsModal } from '../../components/settings/SettingsModal';
import { Project, WorkLog, ClarificationPrompt, ParsedWorkLog, WorkItem } from '../../lib/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateWorkLogEarnings } from '../../lib/workLogUtils';

export default function JournalScreen() {
  const { projects, loading: loadingProjects } = useProjects();
  const { workLogs, loading: loadingLogs, saveLog, updateLogItems, removeLog, moveWorkItem, refresh: refreshLogs } = useWorkLogs();
  const { editItem, deleteItem } = useEditWorkItem();

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Voice Pipeline States
  const [pipelineProcessing, setPipelineProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [showClarification, setShowClarification] = useState(false);
  const [currentClarifications, setCurrentClarifications] = useState<ClarificationPrompt[]>([]);
  const [currentClarificationIndex, setCurrentClarificationIndex] = useState(0);
  const [tempParsedLog, setTempParsedLog] = useState<ParsedWorkLog | null>(null);
  const [tempTranscript, setTempTranscript] = useState('');

  // Load last selected project from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.SELECTED_PROJECT_ID).then(id => {
      if (id) setActiveProjectId(id);
    });
  }, []);

  // Sync selected project to storage
  const handleSelectActiveProject = async (id: string | null) => {
    setActiveProjectId(id);
    if (id) {
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_PROJECT_ID, id);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.SELECTED_PROJECT_ID);
    }
  };

  // Sort projects: Active/With recordings first, then inactive ones translucent
  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    
    // Find project IDs that have records today
    const projectsWithLogs = new Set(
      workLogs
        .filter(log => log.project_id && !log.is_day_off)
        .map(log => log.project_id)
    );

    return [...projects].sort((a, b) => {
      const hasA = projectsWithLogs.has(a.id) ? 1 : 0;
      const hasB = projectsWithLogs.has(b.id) ? 1 : 0;
      return hasB - hasA; // descending (1 first, then 0)
    });
  }, [projects, workLogs]);

  // Calculate earnings for the active project/tab or total if all selected
  const todayEarnings = useMemo(() => {
    return workLogs.reduce((acc, log) => {
      // If we filtered by a specific active project, only sum that project
      if (activeProjectId && log.project_id !== activeProjectId) {
        return acc;
      }
      return acc + calculateWorkLogEarnings(log);
    }, 0);
  }, [workLogs, activeProjectId]);

  // Check if today is marked as a day off (globally or for selected project)
  const isDayOffToday = useMemo(() => {
    const relevantLogs = activeProjectId 
      ? workLogs.filter(l => l.project_id === activeProjectId)
      : workLogs;
    return relevantLogs.some(l => l.is_day_off);
  }, [workLogs, activeProjectId]);

  const handleToggleDayOff = async () => {
    if (isDayOffToday) {
      // Turn day off OFF (delete the day off log)
      const dayOffLog = workLogs.find(l => 
        (activeProjectId ? l.project_id === activeProjectId : l.project_id === null) && l.is_day_off
      );
      if (dayOffLog) {
        await removeLog(dayOffLog.id);
        Alert.alert('Вихідний скасовано', 'Тепер ви можете додавати виконані роботи.');
      }
    } else {
      // Turn day off ON
      // Ensure we confirm first
      Alert.alert(
        'Встановити вихідний?',
        'Сьогодні не буде нараховуватися заробіток. Усі наявні записи за сьогодні буде збережено.',
        [
          { text: 'Скасувать', style: 'cancel' },
          {
            text: 'Так, відпочиваю 🌴',
            onPress: async () => {
              await saveLog({
                project_id: activeProjectId,
                work_date: new Date().toISOString().split('T')[0],
                voice_transcript: 'Сьогодні вихідний',
                work_items: [],
                total_amount: 0,
                volumes_confirmed: true,
                is_day_off: true
              });
            }
          }
        ]
      );
    }
  };

  const handleRecordingFinished = async (uri: string) => {
    setPipelineProcessing(true);
    setProcessingStatus('Завантаження аудіо...');
    try {
      setProcessingStatus('Розпізнавання голосу (Whisper)...');
      const { transcript, parsedLog } = await runVoicePipeline(uri);
      
      if (parsedLog.clarifications && parsedLog.clarifications.length > 0) {
        setTempParsedLog(parsedLog);
        setTempTranscript(transcript);
        setCurrentClarifications(parsedLog.clarifications);
        setCurrentClarificationIndex(0);
        setShowClarification(true);
      } else {
        setProcessingStatus('Збереження виконаних робіт...');
        // Auto-assign project if none detected
        const segmentsToSave = parsedLog.segments.map(seg => {
          if (!seg.projectId && !seg.projectHint) {
            return { ...seg, projectId: activeProjectId };
          }
          return seg;
        });
        await saveParsedSegments(segmentsToSave, transcript);
        Alert.alert('Успішно', 'Роботи записані та додані до журналу!');
        refreshLogs();
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Помилка обробки', err.message || 'Не вдалося обробити аудіозапис');
    } finally {
      setPipelineProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleClarificationSelect = async (selectedOption: string) => {
    if (!tempParsedLog) return;

    const currentPrompt = currentClarifications[currentClarificationIndex];
    
    // Update the workType on the specific item
    const updatedSegments = [...tempParsedLog.segments];
    const item = updatedSegments[currentPrompt.segmentIndex].items[currentPrompt.itemIndex];
    item.workType = selectedOption;

    // Fetch prices to pull details
    const catalog = await getPriceCatalog();
    const matched = catalog.find(c => c.work_type === selectedOption);
    if (matched) {
      item.pricePerUnit = matched.base_price;
      item.unit = matched.unit;
      item.priceFromCatalog = true;
      if (item.volume !== null) {
        item.total = item.volume * matched.base_price;
      }
    }

    const nextIndex = currentClarificationIndex + 1;
    if (nextIndex < currentClarifications.length) {
      setCurrentClarificationIndex(nextIndex);
    } else {
      // All resolved!
      setShowClarification(false);
      setPipelineProcessing(true);
      setProcessingStatus('Збереження робіт...');
      try {
        const segmentsToSave = updatedSegments.map(seg => {
          if (!seg.projectId && !seg.projectHint) {
            return { ...seg, projectId: activeProjectId };
          }
          return seg;
        });
        await saveParsedSegments(segmentsToSave, tempTranscript);
        Alert.alert('Збережено', 'Усі позиції уточнено та записано в базу!');
        refreshLogs();
      } catch (e) {
        Alert.alert('Помилка', 'Не вдалося зберегти роботи');
      } finally {
        setPipelineProcessing(false);
        setTempParsedLog(null);
        setTempTranscript('');
      }
    }
  };

  const handleEditItem = async (logId: string, itemIndex: number, updatedItem: WorkItem) => {
    try {
      await editItem(logId, itemIndex, updatedItem);
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося відредагувати запис');
    }
  };

  const handleDeleteItem = async (logId: string, itemIndex: number) => {
    try {
      await deleteItem(logId, itemIndex);
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося видалити запис');
    }
  };

  const handleMoveItemPrompt = (logId: string, itemIndex: number) => {
    const list = sortedProjects.filter(p => p.id !== activeProjectId);
    if (list.length === 0) {
      Alert.alert('Обмеження', 'Немає інших об\'єктів для перенесення роботи.');
      return;
    }

    const options = list.map(p => ({
      text: p.name,
      onPress: () => moveWorkItem(logId, itemIndex, p.id)
    }));

    Alert.alert(
      'Перенести роботу',
      'Оберіть об\'єкт для перенесення:',
      [
        ...options,
        { text: 'Скасувати', style: 'cancel' }
      ]
    );
  };

  // Filter logs to display for the currently active tab
  const displayedLogs = useMemo(() => {
    if (!activeProjectId) return workLogs;
    return workLogs.filter(l => l.project_id === activeProjectId);
  }, [workLogs, activeProjectId]);

  const hasLogs = displayedLogs.length > 0;
  const projectLogsWithWorks = displayedLogs.filter(l => l.work_items.length > 0);

  return (
    <View style={styles.container}>
      {/* Top Header Row */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Журнал робіт</Text>
          <Text style={styles.headerTitle}>Зароблено сьогодні</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Earnings Dashboard */}
      <View style={styles.dashboard}>
        <Text style={styles.earningsText}>
          {isDayOffToday ? '0 грн' : formatCurrency(todayEarnings)}
        </Text>
        
        <TouchableOpacity 
          style={[styles.dayOffBtn, isDayOffToday && styles.dayOffBtnActive]} 
          onPress={handleToggleDayOff}
        >
          <Text style={[styles.dayOffBtnText, isDayOffToday && styles.dayOffBtnTextActive]}>
            {isDayOffToday ? '🌴 Сьогодні вихідний' : '🌴 Встановити вихідний'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Projects Tabs Selector */}
      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeProjectId === null && styles.tabActive]}
            onPress={() => handleSelectActiveProject(null)}
          >
            <Text style={[styles.tabText, activeProjectId === null && styles.tabTextActive]}>
              Всі об'єкти
            </Text>
          </TouchableOpacity>

          {loadingProjects ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 15 }} />
          ) : (
            sortedProjects.map(proj => {
              // Check if project has records today to apply opacity rule
              const hasRecordsToday = workLogs.some(l => l.project_id === proj.id && !l.is_day_off);
              const isActiveTab = activeProjectId === proj.id;

              return (
                <TouchableOpacity
                  key={proj.id}
                  style={[
                    styles.tab,
                    isActiveTab && styles.tabActive,
                    !isActiveTab && !hasRecordsToday && styles.tabTranslucent
                  ]}
                  onPress={() => handleSelectActiveProject(proj.id)}
                >
                  <Text style={[
                    styles.tabText,
                    isActiveTab && styles.tabTextActive,
                    !isActiveTab && !hasRecordsToday && styles.tabTextTranslucent
                  ]}>
                    {proj.name}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Active Project Details / Info */}
      <View style={styles.selectedProjectInfo}>
        <Text style={styles.selectedProjectText}>
          {activeProjectId 
            ? `Активний об'єкт для нових записів: ${projects.find(p => p.id === activeProjectId)?.name || ''}`
            : 'Нові записи записуватимуться без прив\'язки до об\'єкту'}
        </Text>
      </View>

      {/* Main Records List / Scroll */}
      <ScrollView style={styles.recordsScroll} contentContainerStyle={styles.scrollContent}>
        {loadingLogs ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
        ) : isDayOffToday ? (
          <View style={styles.dayOffCover}>
            <Text style={styles.dayOffCoverEmoji}>🌴</Text>
            <Text style={styles.dayOffCoverText}>Сьогодні оголошено вихідний день.</Text>
            <Text style={styles.dayOffCoverSub}>Насолоджуйтесь відпочинком!</Text>
          </View>
        ) : !hasLogs || projectLogsWithWorks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbox-ellipses-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Журнал порожній</Text>
            <Text style={styles.emptySubtitle}>Запишіть виконану за сьогодні роботу голосом нижче.</Text>
          </View>
        ) : (
          projectLogsWithWorks.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logCardHeader}>
                <Text style={styles.logCardTitle}>
                  {log.project_id 
                    ? projects.find(p => p.id === log.project_id)?.name || 'Об\'єкт' 
                    : 'Без об\'єкту'}
                </Text>
                <Text style={styles.logCardEarning}>
                  {formatCurrency(calculateWorkLogEarnings(log))}
                </Text>
              </View>
              {log.voice_transcript && (
                <Text style={styles.transcriptText}>«{log.voice_transcript}»</Text>
              )}
              <ReportItemTable
                items={log.work_items}
                editable
                onEditItem={(idx, item) => handleEditItem(log.id, idx, item)}
                onDeleteItem={(idx) => handleDeleteItem(log.id, idx)}
                onMoveItem={(idx) => handleMoveItemPrompt(log.id, idx)}
              />
            </View>
          ))
        )}
      </ScrollView>

      {/* Voice Input Section at the Bottom */}
      <View style={styles.recorderContainer}>
        <VoiceRecorder
          onRecordingFinished={handleRecordingFinished}
          isProcessing={pipelineProcessing}
          processingStatus={processingStatus}
        />
      </View>

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Clarification Modal */}
      <ClarificationModal
        visible={showClarification}
        clarifications={currentClarifications}
        currentIndex={currentClarificationIndex}
        onSelect={handleClarificationSelect}
        onCancel={() => {
          setShowClarification(false);
          setTempParsedLog(null);
          setTempTranscript('');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
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
  settingsBtn: {
    padding: 8,
  },
  dashboard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
    marginHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  earningsText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  dayOffBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dayOffBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: COLORS.accent,
  },
  dayOffBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  dayOffBtnTextActive: {
    color: COLORS.accent,
  },
  
  // Projects Tabs
  tabsWrapper: {
    height: 40,
    marginBottom: 12,
  },
  tabsContainer: {
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  tab: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabTranslucent: {
    opacity: 0.5,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabTextTranslucent: {
    color: COLORS.textSecondary,
  },

  selectedProjectInfo: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  selectedProjectText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },

  // Records scroll list
  recordsScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  logCard: {
    backgroundColor: COLORS.card + '50',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  logCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  logCardEarning: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  transcriptText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  
  // Empty states
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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

  dayOffCover: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  dayOffCoverEmoji: {
    fontSize: 48,
    marginBottom: 15,
  },
  dayOffCoverText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 6,
  },
  dayOffCoverSub: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Mic/Voice bottom bar
  recorderContainer: {
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
