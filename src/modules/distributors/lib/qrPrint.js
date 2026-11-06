import { validateNppCode } from './nppCodes.js';

export function validatePrintableNpp(npp) {
  if (!npp?.qrToken) return 'Chưa có mã QR được cấp';
  if (!validateNppCode(npp.code || npp.id, npp.region)) return 'Mã NPP sai định dạng';
  if (!npp.name?.trim()) return 'Thiếu tên NPP';
  return '';
}

export function splitIntoBatches(items, batchSize = 50) {
  const size = Math.max(1, Math.min(50, Math.floor(batchSize) || 50));
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

export function paginateLabels(items, { columns = 2, rows = 5, skip = 0 } = {}) {
  const pageSize = Math.max(1, columns * rows);
  const pages = [];
  let page = Array(Math.max(0, skip)).fill(null);
  for (const item of items) {
    if (page.length === pageSize) { pages.push(page); page = []; }
    page.push(item);
  }
  if (page.length) pages.push(page);
  return pages;
}

export function countLabelSheets(count, copies = 1, skip = 0, perSheet = 10) {
  const total = Math.max(0, Math.floor(count)) * Math.max(1, Math.min(10, Math.floor(copies) || 1));
  return Math.ceil((total + Math.max(0, Math.floor(skip))) / Math.max(1, perSheet));
}

export function fitLabelName(name, maxLength = 80) {
  const value = String(name || '').trim().slice(0, maxLength);
  if (value.length <= 30) return { lines: [value], fontSize: Math.max(6.5, 8.6 - Math.max(0, value.length - 20) * 0.12) };
  return { lines: [value.slice(0, 30).trim(), value.slice(30)], fontSize: 6.5 };
}
