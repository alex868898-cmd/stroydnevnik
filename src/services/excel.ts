import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Project, WorkItem } from '../lib/types';
import { formatDate } from '../lib/formatters';

export interface ExcelReportData {
  project: Project;
  periodStart: string;
  periodEnd: string;
  items: WorkItem[];
  totalAmount: number;
}

/** Generates a real XLSX workbook that opens in Excel and compatible Android apps. */
export async function generateReportExcel(data: ExcelReportData): Promise<string> {
  const { project, periodStart, periodEnd, items, totalAmount } = data;

  const rows: (string | number)[][] = [
    ['КОШТОРИС ВИКОНАНИХ РОБІТ'],
    ['Об’єкт', project.name],
    ...(project.address ? [['Адреса', project.address]] : []),
    ['Період', `з ${formatDate(periodStart)} по ${formatDate(periodEnd)}`],
    [],
    ['Тип', 'Найменування', 'Кількість', 'Одиниця виміру', 'Розцінка (грн)', 'Сума (грн)'],
    ...items.map(item => [
      item.itemType === 'material' ? 'Матеріал' : 'Робота',
      item.action || '',
      item.volume ?? '',
      item.unit || '',
      item.pricePerUnit ?? 0,
      item.total ?? 0,
    ]),
    [],
    ['', '', '', '', 'Всього', totalAmount],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 42 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Кошторис');
  const base64 = XLSX.write(workbook, {
    type: 'base64',
    bookType: 'xlsx',
    compression: true,
  });

  const targetDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!targetDirectory) {
    throw new Error('Сховище документів недоступне');
  }
  const safeProjectId = String(project.id || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileUri = `${targetDirectory}koshtorys_${safeProjectId}_${Date.now()}.xlsx`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}
