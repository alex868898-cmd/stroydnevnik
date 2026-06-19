import * as FileSystem from 'expo-file-system/legacy';
import { Project, WorkItem } from '../lib/types';
import { formatDate } from '../lib/formatters';

export interface CSVReportData {
  project: Project;
  periodStart: string;
  periodEnd: string;
  items: WorkItem[];
  totalAmount: number;
}

/**
 * Generates a CSV file formatted specifically for MS Excel (using ; separator and UTF-8 BOM)
 * Returns the local file URI.
 */
export async function generateReportCSV(data: CSVReportData): Promise<string> {
  const { project, periodStart, periodEnd, items, totalAmount } = data;
  
  // UTF-8 Byte Order Mark (BOM) to force Excel to open in UTF-8 mode
  const BOM = '\uFEFF';
  
  // CSV Headers
  let csv = 'Найменування робіт;Кількість;Одиниця виміру;Розцінка (грн);Сума (грн)\r\n';
  
  // Add rows
  items.forEach(item => {
    // Escape quotes and remove semicolons from text
    const cleanAction = (item.action || '').replace(/"/g, '""').replace(/;/g, ',');
    const cleanUnit = (item.unit || '').replace(/"/g, '""').replace(/;/g, ',');
    
    // Use commas for decimals (Ukrainian standard in Excel)
    const volume = item.volume !== null ? String(item.volume).replace('.', ',') : '-';
    const price = item.pricePerUnit !== null ? String(item.pricePerUnit).replace('.', ',') : '0';
    const total = item.total !== null ? String(item.total).replace('.', ',') : '0';
    
    csv += `"${cleanAction}";${volume};"${cleanUnit}";${price};${total}\r\n`;
  });
  
  // Add spacing and summary meta info
  csv += '\r\n';
  csv += `Всього зароблено;;;;${String(totalAmount).replace('.', ',')}\r\n`;
  csv += `Об'єкт:;"${project.name.replace(/"/g, '""')}"\r\n`;
  if (project.address) {
    csv += `Адреса:;"${project.address.replace(/"/g, '""')}"\r\n`;
  }
  csv += `Період:;"з ${formatDate(periodStart)} по ${formatDate(periodEnd)}"\r\n`;
  csv += `Згенеровано:;"${formatDate(new Date())}"\r\n`;

  // Write to document directory using legacy expo-file-system import
  const filename = `koshtorys_${project.id}_${Date.now()}.csv`;
  const fileUri = `${FileSystem.documentDirectory}${filename}`;
  
  await FileSystem.writeAsStringAsync(fileUri, BOM + csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return fileUri;
}
