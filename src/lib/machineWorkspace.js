export function resolveMachine(sets, value) {
  const query = String(value || '').trim().toLocaleLowerCase('vi');
  if (!query || query.length > 160) return null;
  const matches = sets.filter(set => ['setCode', 'dispenserSerial', 'mixerSerial', 'computerSerial', 'printerSerial'].some(key => String(set[key] || '').trim().toLocaleLowerCase('vi') === query));
  return matches.length === 1 ? matches[0] : null;
}

export function maintenanceSteps(model = '') {
  const common = ['Ngắt nguồn, kiểm tra điều kiện an toàn', 'Kiểm tra nguồn điện, ổn áp và tiếp địa'];
  const family = /satint/i.test(model) ? ['Kiểm tra van, phớt và pít-tông', 'Kiểm tra vị trí van và encoder'] : /hero/i.test(model) ? ['Kiểm tra bơm và đầu phun Eurotint', 'Kiểm tra khuấy màu và nắp giữ ẩm'] : /corob/i.test(model) ? ['Kiểm tra đầu chiết và chu trình purge', 'Kiểm tra kết nối PC và CorobTINT'] : /fast|fluid|ha480/i.test(model) ? ['Kiểm tra van và đầu phun HA480', 'Kiểm tra bơm, khuấy và chương trình vệ sinh'] : ['Kiểm tra cụm bơm theo hướng dẫn hãng', 'Kiểm tra khuấy màu và đầu chiết'];
  return [...common, ...family, 'Kiểm tra rò rỉ, ống dẫn và đầu chiết', 'Vệ sinh máy, kiểm tra kết nối PC', 'Chiết thử, kiểm tra định lượng', 'Kiểm tra máy lắc, máy in và bàn giao'];
}

export function maintenanceNotes(model, results, parts, notes, photoSummary = '') {
  const steps = maintenanceSteps(model);
  if (results.length !== steps.length || results.some(value => !['PASS', 'ISSUE', 'NA'].includes(value))) throw new Error('Vui lòng đánh giá đầy đủ checklist.');
  const labels = { PASS: 'Đạt', ISSUE: 'Có lỗi', NA: 'Không áp dụng' };
  const text = [`Checklist · ${model || 'Chưa xác định model'}`, ...steps.map((step, index) => `${index + 1}. ${step}: ${labels[results[index]]}`), `Vật tư: ${String(parts || '').trim()}`, `Ghi chú: ${String(notes || '').trim()}`, photoSummary].filter(Boolean).join('\n');
  if (text.length > 4000) throw new Error('Nội dung checklist vượt quá 4000 ký tự.');
  return text;
}

export function matchesDocumentModel(documentModel, machineModel) {
  const normalize = value => String(value || '').trim().toLocaleLowerCase('vi');
  return !normalize(documentModel) || normalize(documentModel) === normalize(machineModel);
}
