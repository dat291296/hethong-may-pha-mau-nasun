export async function mapWithConcurrency(items, concurrency, mapper) {
  if (!Array.isArray(items) || typeof mapper !== 'function') {
    throw new TypeError('INVALID_CONCURRENT_MAP_INPUT');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('INVALID_CONCURRENCY');
  }
  if (items.length === 0) return [];

  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
