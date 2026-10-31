// Preserve all requested fields and reject stale updates before reporting success.
export function requireCompleteWrite(result) {
  if (result.error) {
    const code = String(result.error.code || '');
    if (['42703', 'PGRST204'].includes(code)) {
      throw Object.assign(new Error('Database thiếu trường cần lưu. Nội dung chưa được lưu; giữ bản nháp và liên hệ quản trị để cập nhật migration.'), { code: 'SCHEMA_MIGRATION_REQUIRED' });
    }
    throw result.error;
  }
  if (Array.isArray(result.data) && result.data.length === 0) {
    throw Object.assign(new Error('Bản ghi đã thay đổi, không còn tồn tại hoặc bạn không có quyền ghi. Giữ nội dung đang nhập và tải lại dữ liệu trước khi thử lại.'), { code: 'WRITE_CONFLICT' });
  }
  return result;
}

export async function updateWithRevision({ runQuery, table, id, updates, expectedRevision }) {
  if (typeof expectedRevision !== 'string' || !Number.isFinite(Date.parse(expectedRevision))) {
    throw Object.assign(new Error('Chưa có phiên bản dữ liệu từ máy chủ. Giữ nội dung đang nhập, tải lại NPP trước khi lưu.'), { code: 'REVISION_REQUIRED' });
  }
  const result = await runQuery(client => client.from(table).update(updates)
    .eq('id', id).eq('updated_at', expectedRevision).select('id, updated_at'));
  return requireCompleteWrite(result);
}
