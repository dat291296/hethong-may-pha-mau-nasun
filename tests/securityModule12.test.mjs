import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageUrl = new URL('../package.json', import.meta.url);
const utilityUrl = new URL('../src/utils/secureSpreadsheet.js', import.meta.url);
const modalUrl = new URL('../src/components/ExcelImportModal.jsx', import.meta.url);

test('vulnerable SheetJS package is removed in favor of ExcelJS', async () => {
  const pkg = JSON.parse(await readFile(packageUrl, 'utf8'));
  assert.equal(pkg.dependencies.xlsx, undefined);
  assert.equal(pkg.dependencies.exceljs, '^4.4.0');
});

test('spreadsheet parser enforces file, sheet, row, and column limits', async () => {
  const utility = await readFile(utilityUrl, 'utf8');
  assert.match(utility, /maxFileBytes: 5 \* 1024 \* 1024/);
  assert.match(utility, /maxSheets: 5/);
  assert.match(utility, /maxRows: 5000/);
  assert.match(utility, /maxColumns: 50/);
  assert.match(utility, /if \(cell\.formula\) throw new Error/);
  assert.match(utility, /ALLOWED_EXTENSIONS = new Set\(\['xlsx', 'csv'\]\)/);
});

test('import UI no longer accepts legacy xls files', async () => {
  const modal = await readFile(modalUrl, 'utf8');
  assert.match(modal, /accept="\.xlsx,\.csv"/);
  assert.doesNotMatch(modal, /accept="[^"]*\.xls,/);
  assert.match(modal, /parseSpreadsheetFile\(file\)/);
});
