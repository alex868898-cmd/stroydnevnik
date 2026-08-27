import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Project, WorkItem } from '../lib/types';
import { formatCurrency, formatDate } from '../lib/formatters';
import { ContractorProfile } from './contractorProfile';

export interface ReportData {
  project: Project;
  periodStart: string;
  periodEnd: string;
  items: WorkItem[];
  totalAmount: number;
  contractor?: ContractorProfile;
  receiptImages?: string[];
}

/**
 * Generates an elegant PDF document for project estimates using expo-print
 */
export async function generateReportPDF(data: ReportData): Promise<string> {
  const { project, periodStart, periodEnd, items, totalAmount, contractor, receiptImages = [] } = data;
  
  const itemsHtml = items.map((item, index) => `
    <tr class="${index % 2 === 0 ? 'even' : 'odd'}">
      <td class="col-name">${item.action}</td>
      <td class="col-volume">${item.volume !== null ? item.volume : '-'}</td>
      <td class="col-unit">${item.unit || '-'}</td>
      <td class="col-price">${formatCurrency(item.pricePerUnit)}</td>
      <td class="col-total">${formatCurrency(item.total)}</td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Кошторис - ${project.name}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
            color: #1e293b;
            margin: 40px;
            font-size: 14px;
            line-height: 1.5;
          }
          .header {
            margin-bottom: 30px;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 15px;
          }
          .title {
            font-size: 24px;
            font-weight: bold;
            color: #0f172a;
            margin: 0 0 5px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .subtitle {
            font-size: 14px;
            color: #64748b;
            margin: 0;
          }
          .info-table {
            width: 100%;
            margin-bottom: 30px;
          }
          .info-table td {
            padding: 4px 0;
          }
          .info-label {
            font-weight: bold;
            color: #475569;
            width: 120px;
          }
          .info-value {
            color: #0f172a;
          }
          table.items {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          table.items th {
            background-color: #1e293b;
            color: #ffffff;
            font-weight: bold;
            text-align: left;
            padding: 10px;
            font-size: 12px;
            text-transform: uppercase;
          }
          table.items td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
          }
          .even {
            background-color: #f8fafc;
          }
          .col-name {
            font-weight: 500;
          }
          .col-volume, .col-unit, .col-price, .col-total {
            text-align: right;
          }
          table.items th.col-volume, table.items th.col-unit, table.items th.col-price, table.items th.col-total {
            text-align: right;
          }
          .totals-container {
            width: 100%;
            margin-top: 20px;
          }
          .totals-table {
            float: right;
            width: 300px;
            border-collapse: collapse;
          }
          .totals-table td {
            padding: 8px 10px;
          }
          .total-label {
            font-size: 16px;
            font-weight: bold;
            color: #0f172a;
          }
          .total-value {
            font-size: 18px;
            font-weight: bold;
            color: #10b981;
            text-align: right;
          }
          .footer {
            margin-top: 60px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
            border-top: 1px dashed #e2e8f0;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">Кошторис виконаних робіт</h1>
          <p class="subtitle">Згенеровано в додатку СтройДневник</p>
        </div>

        <table class="info-table">
          ${contractor?.name ? `<tr><td class="info-label">Підрядник:</td><td class="info-value"><strong>${contractor.name}</strong></td></tr>` : ''}
          ${contractor?.phone ? `<tr><td class="info-label">Телефон:</td><td class="info-value">${contractor.phone}</td></tr>` : ''}
          <tr>
            <td class="info-label">Об'єкт:</td>
            <td class="info-value">${project.name}</td>
          </tr>
          ${project.address ? `
          <tr>
            <td class="info-label">Адреса:</td>
            <td class="info-value">${project.address}</td>
          </tr>` : ''}
          <tr>
            <td class="info-label">Період:</td>
            <td class="info-value">з ${formatDate(periodStart)} по ${formatDate(periodEnd)}</td>
          </tr>
          <tr>
            <td class="info-label">Дата створення:</td>
            <td class="info-value">${formatDate(new Date())}</td>
          </tr>
        </table>

        <table class="items">
          <thead>
            <tr>
              <th style="width: 45%;">Найменування робіт</th>
              <th class="col-volume" style="width: 12%;">Кількість</th>
              <th class="col-unit" style="width: 10%;">Од. вим.</th>
              <th class="col-price" style="width: 15%;">Розцінка</th>
              <th class="col-total" style="width: 18%;">Сума</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals-container">
          <table class="totals-table">
            <tr>
              <td class="total-label">Всього зароблено:</td>
              <td class="total-value">${formatCurrency(totalAmount)}</td>
            </tr>
          </table>
          <div style="clear: both;"></div>
        </div>

        <div class="footer">
          ${receiptImages.length ? `<div style="page-break-before: always; text-align:left;"><h2>Підтвердження витрат — чеки</h2>${receiptImages.map((src, index) => `<div style="margin:18px 0; page-break-inside:avoid;"><p><strong>Чек ${index + 1}</strong></p><img src="${src}" style="max-width:100%; max-height:680px; object-fit:contain;" /></div>`).join('')}</div>` : ''}
          <p>Дякуємо за співпрацю! Документ є офіційним звітом про виконані роботи.</p>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({
    html: htmlContent,
    base64: false,
  });

  if (!FileSystem.documentDirectory) {
    throw new Error('Сховище документів недоступне');
  }

  const safeProjectName = project.name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'proekt';
  const destination = `${FileSystem.documentDirectory}koshtorys_${safeProjectName}_${Date.now()}.pdf`;
  await FileSystem.copyAsync({ from: uri, to: destination });

  return destination;
}
