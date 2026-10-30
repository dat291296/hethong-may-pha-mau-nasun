// Restore only the removed row, preserving unrelated edits received while saving.
export async function optimisticRemoval({ id, key, read, update, persist }) {
  const previous = read();
  const index = previous.findIndex(row => row[key] === id);
  if (index < 0) throw new Error('Không tìm thấy bản ghi. Tải lại dữ liệu trước khi xóa.');
  const removed = previous[index];
  update(rows => rows.filter(row => row[key] !== id));
  try {
    return await persist();
  } catch (error) {
    update(rows => {
      if (rows.some(row => row[key] === id)) return rows;
      const restored = [...rows];
      restored.splice(Math.min(index, restored.length), 0, removed);
      return restored;
    });
    throw error;
  }
}
