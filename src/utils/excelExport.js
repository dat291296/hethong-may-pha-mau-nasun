import * as XLSX from 'xlsx';
import { sanitizeForSheet } from '../security/sanitize.js';

export function exportExcel(rows, columns, filename, sheetName = 'Data') {
  const headers = columns.map(column => column.label);
  const body = rows.map(row => columns.map(column => sanitizeForSheet(row[column.key] ?? '')));
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  sheet['!cols'] = columns.map(column => ({ wch: Math.max(16, Math.min(38, column.label.length + 4)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
