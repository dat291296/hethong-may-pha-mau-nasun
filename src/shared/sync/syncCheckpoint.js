// A cursor acknowledges durable local refresh, never just an HTTP response.
export async function commitSyncCheckpoint({ pending, cursor, owner, generation, persist }) {
  if (!pending || !Number.isSafeInteger(cursor) || cursor < 0 || pending.cursor !== cursor
    || pending.owner !== owner || pending.generation !== generation) return false;
  return await persist(cursor) === true;
}

export async function refreshBeforeCheckpoint(tasks, acknowledge) {
  const results = await Promise.allSettled(tasks);
  if (results.some(result => result.status !== 'fulfilled' || result.value !== true)) return false;
  return await acknowledge();
}
