import { sanitizeForSheet } from '../security/sanitize.js';
import { downloadSpreadsheet } from './secureSpreadsheet.js';

export async function exportExcel(rows, columns, filename, sheetName = 'Data') {
  const headers = columns.map(column => column.label);
  const body = rows.map(row => columns.map(column => sanitizeForSheet(row[column.key] ?? '')));
  const widths = columns.map(column => Math.max(16, Math.min(38, column.label.length + 4)));
  await downloadSpreadsheet([headers, ...body], `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`, sheetName, widths);
}
