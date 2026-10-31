export async function persistBatchMutation({ items, key = 'id', online, write, queue }) {
  const identities = items.map(item => item[key]);
  if (identities.some(id => !id) || new Set(identities).size !== identities.length) {
    throw Object.assign(new Error('Dữ liệu nhập có mã trống hoặc trùng. Kiểm tra lại file.'), { code: 'INVALID_BATCH_IDENTITIES' });
  }
  if (!items.length) return { queued:false, data:[] };
  return persistMutation({ online, write:async () => {
    const result = await write(items);
    if (!result.error) {
      const saved = new Set((result.data || []).map(item => item[key]));
      if (saved.size !== identities.length || identities.some(id => !saved.has(id))) {
        throw Object.assign(new Error('Chưa xác nhận đủ bản ghi trên server. Giữ file nhập để đối chiếu.'), {code:'PERSISTENCE_DENIED'});
      }
    }
    return result;
  }, queue:async () => { for (const item of items) await queue(item); } });
}

export function isTransientMutationError(error) {
  const code = String(error?.code || '');
  if (code === 'QUERY_TIMEOUT') return true;
  if (code || [400, 401, 403, 404, 409, 422].includes(error?.status)) return false;
  return /fetch|network|timeout|connection|failed to fetch/i.test(String(error?.message || ''));
}

export async function persistMutation({ online, write, queue }) {
  if (online) {
    const { data, error } = await write();
    if (!error) {
      if (Array.isArray(data) && data.length === 0) {
        throw Object.assign(new Error('Không có quyền ghi hoặc bản ghi không còn tồn tại.'), { code: 'PERSISTENCE_DENIED' });
      }
      return { queued: false, data };
    }
    if (!isTransientMutationError(error)) throw error;
  }
  await queue();
  return { queued: true };
}

export async function persistQueueReplacement({ save, remove, newItem, previousId }) {
  if (!await save(newItem)) throw new Error('OFFLINE_QUEUE_PERSIST_FAILED');
  // Never delete the previous durable edit until its replacement is committed.
  if (previousId) await remove(previousId);
}
