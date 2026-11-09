export const normalizeImportIdentity = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

export function findDuplicateImportRows(rows, columnIndex, normalize = normalizeImportIdentity) {
  const groups = new Map();
  if (columnIndex < 0) return new Map();
  rows.forEach((row, index) => {
    const value = normalize(row[columnIndex]);
    if (value) groups.set(value, [...(groups.get(value) || []), index + 2]);
  });
  return new Map([...groups].filter(([, lines]) => lines.length > 1));
}
