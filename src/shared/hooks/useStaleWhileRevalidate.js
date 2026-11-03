import { useCallback, useEffect, useRef, useState } from 'react';
import { getOfflineOwner } from '../sync/offlineDb.js';
import { readIdbCache, writeIdbCache } from '../data-access/idbCache.js';

export function useStaleWhileRevalidate({ cacheKey, fetcher, initialData = null, ttlMs, enabled = true }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const generationRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(async ({ signal } = {}) => {
    const generation = generationRef.current;
    const owner = getOfflineOwner();
    setRefreshing(true);
    setError(null);
    try {
      const nextData = await fetcherRef.current({ signal });
      if (signal?.aborted || generation !== generationRef.current || owner !== getOfflineOwner()) return null;
      setData(nextData);
      await writeIdbCache(cacheKey, nextData, { ttlMs });
      return nextData;
    } catch (fetchError) {
      if (!signal?.aborted && generation === generationRef.current && owner === getOfflineOwner()) setError(fetchError);
      return null;
    } finally {
      if (!signal?.aborted && generation === generationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [cacheKey, ttlMs]);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return undefined;
    }
    const controller = new AbortController();
    const owner = getOfflineOwner();
    let disposed = false;
    async function hydrateThenRefresh() {
      try {
        const cached = await readIdbCache(cacheKey, { allowExpired: true });
        if (disposed || generation !== generationRef.current || owner !== getOfflineOwner()) return;
        if (cached) setData(cached.data);
      } catch (cacheError) {
        if (!disposed && generation === generationRef.current) console.warn('[useStaleWhileRevalidate] Cache read failed.');
      }
      if (!disposed && generation === generationRef.current) await revalidate({ signal: controller.signal });
    }
    void hydrateThenRefresh().finally(() => {
      if (!disposed && generation === generationRef.current) setLoading(false);
    });
    return () => {
      disposed = true;
      controller.abort();
      generationRef.current += 1;
    };
  }, [cacheKey, enabled, revalidate]);

  return { data, setData, loading, refreshing, error, revalidate };
}
