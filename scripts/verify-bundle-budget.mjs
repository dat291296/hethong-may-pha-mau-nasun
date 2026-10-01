import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const assetsDir = join(distDir, 'assets');
const limits = {
  entry: 550 * 1024,
  assetManagement: 550 * 1024,
  excel: 1024 * 1024,
  totalJavaScript: 2600 * 1024
};

const indexHtml = await readFile(join(distDir, 'index.html'), 'utf8');
const entryMatch = indexHtml.match(/src="\.\/assets\/(index-[^"]+\.js)"/);
if (!entryMatch) throw new Error('Unable to identify the production entry bundle');

const files = (await readdir(assetsDir)).filter(file => file.endsWith('.js'));
const fileSizes = new Map();
for (const file of files) fileSizes.set(file, (await stat(join(assetsDir, file))).size);

function requireChunk(prefix) {
  const match = files.find(file => file.startsWith(prefix));
  if (!match) throw new Error(`Required lazy chunk is missing: ${prefix}`);
  return match;
}

function enforce(file, maxBytes, label) {
  const bytes = fileSizes.get(file);
  if (bytes > maxBytes) {
    throw new Error(`${label} exceeds bundle budget: ${bytes} > ${maxBytes} bytes (${file})`);
  }
  console.log(`[Bundle budget] ${label}: ${bytes}/${maxBytes} bytes`);
}

const entry = entryMatch[1];
const assetManagement = requireChunk('AssetManagement-');
const excel = requireChunk('exceljs.min-');
enforce(entry, limits.entry, 'application entry');
enforce(assetManagement, limits.assetManagement, 'asset management lazy chunk');
enforce(excel, limits.excel, 'ExcelJS lazy chunk');

const totalJavaScript = [...fileSizes.values()].reduce((sum, bytes) => sum + bytes, 0);
if (totalJavaScript > limits.totalJavaScript) {
  throw new Error(`Total JavaScript exceeds bundle budget: ${totalJavaScript} > ${limits.totalJavaScript} bytes`);
}
console.log(`[Bundle budget] total JavaScript: ${totalJavaScript}/${limits.totalJavaScript} bytes`);
