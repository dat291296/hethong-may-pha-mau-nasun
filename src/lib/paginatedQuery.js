// Keep incomplete responses out of the authoritative offline cache.
export async function fetchAllRows(buildQuery, runQuery, context, { key = 'id', pageSize = 500 } = {}) {
  const rows = [];
  const seen = new Set();
  let expectedCount;
  try {
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('INVALID_PAGE_SIZE');
    while (true) {
      const offset = rows.length;
      const { data, count, error } = await runQuery(
        client => buildQuery(client).range(offset, offset + pageSize - 1), `${context}:page:${offset}`
      );
      if (error) return { data: null, error };
      if (!Array.isArray(data) || !Number.isInteger(count) || count < 0) throw new Error('PAGINATION_COUNT_REQUIRED');
      if (expectedCount === undefined) expectedCount = count;
      if (count !== expectedCount) throw new Error('PAGINATION_DATA_CHANGED');
      for (const row of data) {
        const identity = row[key];
        if (identity == null || seen.has(String(identity))) throw new Error('PAGINATION_DATA_CHANGED');
        seen.add(String(identity));
        rows.push(row);
      }
      if (rows.length === count) return { data: rows, error: null };
      if (data.length === 0 || rows.length > count) throw new Error('PAGINATION_INCOMPLETE');
    }
  } catch (error) {
    return { data: null, error: Object.assign(error, { code: 'INCOMPLETE_QUERY' }) };
  }
}
