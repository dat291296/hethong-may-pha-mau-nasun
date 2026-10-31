export const SPREADSHEET_LIMITS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxSheets: 5,
  maxRows: 5000,
  maxColumns: 50,
});

const ALLOWED_EXTENSIONS = new Set(['xlsx', 'csv']);

async function createWorkbook() {
  const excelModule = await import('exceljs');
  const ExcelJS = excelModule.default || excelModule;
  return new ExcelJS.Workbook();
}

function getExtension(filename = '') {
  return filename.toLowerCase().split('.').pop();
}

function normalizeCellValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if ('text' in value) return String(value.text || '');
    if ('result' in value) return String(value.result ?? '');
    return '';
  }
  return String(value);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (quoted) throw new Error('File CSV có dấu ngoặc kép chưa đóng.');
  return rows;
}

function enforceDimensions(rows) {
  if (rows.length > SPREADSHEET_LIMITS.maxRows) {
    throw new Error(`File vượt quá ${SPREADSHEET_LIMITS.maxRows} dòng.`);
  }
  if (rows.some(row => row.length > SPREADSHEET_LIMITS.maxColumns)) {
    throw new Error(`File vượt quá ${SPREADSHEET_LIMITS.maxColumns} cột.`);
  }
}

export async function parseSpreadsheetFile(file) {
  if (!file) throw new Error('Chưa chọn file dữ liệu.');
  const extension = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('Chỉ hỗ trợ file .xlsx hoặc .csv.');
  }
  if (file.size <= 0 || file.size > SPREADSHEET_LIMITS.maxFileBytes) {
    throw new Error('File phải có dung lượng từ 1 byte đến 5 MB.');
  }

  if (extension === 'csv') {
    const rows = parseCsv(await file.text());
    enforceDimensions(rows);
    return rows;
  }

  const workbook = await createWorkbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  if (!workbook.worksheets.length) throw new Error('File Excel không có sheet dữ liệu.');
  if (workbook.worksheets.length > SPREADSHEET_LIMITS.maxSheets) {
    throw new Error(`File vượt quá ${SPREADSHEET_LIMITS.maxSheets} sheet.`);
  }

  const worksheet = workbook.worksheets[0];
  if (worksheet.actualRowCount > SPREADSHEET_LIMITS.maxRows || worksheet.actualColumnCount > SPREADSHEET_LIMITS.maxColumns) {
    throw new Error(`Sheet vượt giới hạn ${SPREADSHEET_LIMITS.maxRows} dòng hoặc ${SPREADSHEET_LIMITS.maxColumns} cột.`);
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, row => {
    const values = [];
    const lastColumn = Math.min(row.cellCount, SPREADSHEET_LIMITS.maxColumns);
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = row.getCell(column);
      if (cell.formula) throw new Error(`Không cho phép công thức Excel tại dòng ${row.number}, cột ${column}.`);
      values.push(normalizeCellValue(cell.value));
    }
    rows.push(values);
  });
  enforceDimensions(rows);
  return rows;
}

export async function downloadSpreadsheet(rows, filename, sheetName = 'Data', widths = []) {
  const workbook = await createWorkbook();
  workbook.creator = 'NASUN PAINT';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(String(sheetName || 'Data').slice(0, 31));
  rows.forEach(row => worksheet.addRow(row));
  worksheet.columns = (rows[0] || []).map((_, index) => ({ width: widths[index] || 24 }));
  if (worksheet.rowCount > 0) {
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
