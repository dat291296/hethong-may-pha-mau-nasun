import { useCallback, useRef, useState } from 'react';

export function usePullToRefresh(onRefresh, { threshold = 72, disabled = false } = {}) {
  const startY = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onTouchStart = useCallback(event => {
    startY.current = null;
    setPullDistance(0);
    if (disabled || refreshing || window.scrollY > 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.modal-overlay, [role="dialog"], .desktop-sidebar, .data-table-container, input, textarea, select, button, a')) return;
    const scroller = target instanceof Element ? target.closest('.nasun-workspace') : null;
    if (scroller && scroller.scrollTop > 0) return;
    startY.current = event.touches[0]?.clientY ?? null;
  }, [disabled, refreshing]);
  const onTouchMove = useCallback(event => {
    if (startY.current === null || refreshing) return;
    const delta = Math.max(0, Math.min(110, event.touches[0].clientY - startY.current));
    setPullDistance(delta);
  }, [refreshing]);
  const onTouchEnd = useCallback(async () => {
    const shouldRefresh = !disabled && !refreshing && pullDistance >= threshold;
    startY.current = null;
    setPullDistance(0);
    if (!shouldRefresh) return;
    setRefreshing(true);
    try { await onRefresh?.(); }
    finally { setRefreshing(false); }
  }, [disabled, onRefresh, pullDistance, refreshing, threshold]);
  return { pullDistance, refreshing, onTouchStart, onTouchMove, onTouchEnd };
}
