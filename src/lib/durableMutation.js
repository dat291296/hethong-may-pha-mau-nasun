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
