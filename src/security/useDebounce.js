import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useDebounce – delays updating a value until after `delay` ms of no changes.
 * Use on search inputs to prevent DoS on Supabase / re-render storms.
 *
 * @param {*} value – value to debounce
 * @param {number} delay – ms to wait (default 180)
 * @returns {*} debounced value
 *
 * @example
 *   const debouncedSearch = useDebounce(searchTerm, 180);
 *   useEffect(() => { fetchResults(debouncedSearch); }, [debouncedSearch]);
 */
export function useDebounce(value, delay = 180) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useRateLimit – wraps an async function and enforces a minimum interval
 * between successive calls. Prevents API flooding / DoS.
 *
 * @param {Function} fn – async function to rate-limit
 * @param {number} minIntervalMs – minimum ms between calls (default 200)
 * @returns {Function} rate-limited version of fn
 *
 * @example
 *   const safeSubmit = useRateLimit(handleSubmit, 1000);
 *   <button onClick={safeSubmit}>Save</button>
 */
export function useRateLimit(fn, minIntervalMs = 200) {
  const lastCalledAt = useRef(0);

  return useCallback(
    async (...args) => {
      const now = Date.now();
      if (now - lastCalledAt.current < minIntervalMs) {
        console.warn('[RateLimit] Call blocked – too frequent');
        return;
      }
      lastCalledAt.current = now;
      return fn(...args);
    },
    [fn, minIntervalMs]
  );
}

/**
 * useThrottle – throttles a value update (leading-edge, unlike debounce).
 *
 * @param {*} value – value to throttle
 * @param {number} limit – ms throttle window
 * @returns {*} throttled value
 */
export function useThrottle(value, limit = 300) {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now >= lastUpdated.current + limit) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
      }, limit);
      return () => clearTimeout(timer);
    }
  }, [value, limit]);

  return throttledValue;
}
