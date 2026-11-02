// Aborting the transport does not prove a database write was rolled back.
export async function queryWithDeadline(client, buildQuery, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ data: null, error: Object.assign(new Error('Yêu cầu quá thời gian; kiểm tra kết quả đồng bộ trước khi tạo lại.'),
          { code: 'QUERY_TIMEOUT', outcomeUnknown: true }) });
      }, timeoutMs);
    });
    const query = buildQuery(client, controller.signal);
    const operation = typeof query?.abortSignal === 'function' ? query.abortSignal(controller.signal) : query;
    const result = await Promise.race([Promise.resolve(operation), timeout]);
    if (controller.signal.aborted) return { data: null, error: Object.assign(new Error('Yêu cầu quá thời gian; kiểm tra kết quả đồng bộ trước khi tạo lại.'),
      { code: 'QUERY_TIMEOUT', outcomeUnknown: true }) };
    return result;
  } catch (error) {
    return { data: null, error };
  } finally { clearTimeout(timer); }
}
