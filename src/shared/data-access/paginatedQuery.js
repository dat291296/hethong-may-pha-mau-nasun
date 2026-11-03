// Keep incomplete responses out of the authoritative offline cache.
export async function fetchAllRows(buildQuery, runQuery, context, { key = 'id', pageSize = 200 } = {}) {
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
      if (!Array.isArray(data)) throw new Error('PAGINATION_RESPONSE_INVALID');
      if (count !== undefined && count !== null) {
        if (!Number.isInteger(count) || count < 0) throw new Error('PAGINATION_COUNT_INVALID');
        if (expectedCount === undefined) expectedCount = count;
        if (count !== expectedCount) throw new Error('PAGINATION_DATA_CHANGED');
      }
      if (!data.length) {
        if (expectedCount !== undefined && rows.length !== expectedCount) throw new Error('PAGINATION_INCOMPLETE');
        return { data: rows, error: null };
      }
      for (const row of data) {
        const identity = row[key];
        if (identity == null || seen.has(String(identity))) throw new Error('PAGINATION_DATA_CHANGED');
        seen.add(String(identity));
        rows.push(row);
      }
      if (expectedCount !== undefined && rows.length === expectedCount) return { data: rows, error: null };
      if (expectedCount !== undefined && rows.length > expectedCount) throw new Error('PAGINATION_INCOMPLETE');
    }
  } catch (error) {
    return { data: null, error: Object.assign(error, { code: 'INCOMPLETE_QUERY' }) };
  }
}
