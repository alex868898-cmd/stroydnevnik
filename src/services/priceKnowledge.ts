import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { clearCatalogCache, supabase } from './supabase';

export interface PriceRange { min: number; max: number; avg: number; samples: number; }

const text = (value: unknown) => String(value ?? '').trim();
const numeric = (value: unknown) => Number(text(value).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
const normalizeUnit = (value: unknown) => {
  const unit = text(value).toLowerCase();
  if (unit.includes('м2') || unit.includes('м²') || unit.includes('кв')) return 'м²';
  if (unit.includes('пог') || unit.includes('п.м') || unit.includes('м.п')) return 'п.м';
  return text(value) || 'послуга';
};

export async function importPriceFile() {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const workbook = XLSX.read(base64, { type: 'base64' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
  if (!rows.length) throw new Error('Файл не містить рядків');

  const headerIndex = rows.findIndex(row => row.some(cell => /наймен|назв|робот|послуг/i.test(text(cell))));
  const firstRow = headerIndex >= 0 ? headerIndex : 0;
  const header = (rows[firstRow] || []).map(cell => text(cell).toLowerCase());
  const nameIndex = header.findIndex(cell => /наймен|назв|робот|послуг/.test(cell));
  const priceIndex = header.findIndex(cell => /цін|цен|варт|стоим|price/.test(cell));
  const unitIndex = header.findIndex(cell => /один|единиц|вимір|unit/.test(cell));
  if (nameIndex < 0 || priceIndex < 0) throw new Error('Потрібні колонки «Найменування роботи» та «Ціна»');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Потрібно увійти в обліковий запис');
  const imported = rows.slice(firstRow + 1).map(row => ({
    work_type: text(row[nameIndex]),
    price: numeric(row[priceIndex]),
    unit: normalizeUnit(unitIndex >= 0 ? row[unitIndex] : ''),
    source_user_id: user.id,
    source: 'price_import',
  })).filter(row => row.work_type && Number.isFinite(row.price) && row.price > 0);
  if (!imported.length) throw new Error('Не знайдено жодного коректного рядка з ціною');
  const { error } = await supabase.from('price_statistics').insert(imported);
  if (error) throw error;
  clearCatalogCache();
  return { count: imported.length, fileName: asset.name };
}

export async function getPriceRange(workType: string): Promise<PriceRange | null> {
  const [{ data: catalog }, { data: statistics }] = await Promise.all([
    supabase.from('price_catalog').select('base_price').ilike('work_type', workType.trim()),
    supabase.from('price_statistics').select('price').ilike('work_type', workType.trim()),
  ]);
  const prices = [...(catalog || []).map(row => Number(row.base_price)), ...(statistics || []).map(row => Number(row.price))]
    .filter(value => Number.isFinite(value) && value >= 0);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices), avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length), samples: prices.length };
}
