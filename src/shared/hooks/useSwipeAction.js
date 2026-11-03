import { useCallback, useMemo, useRef } from 'react';
import { useDrag } from '@use-gesture/react';
import { triggerHaptic } from '../platform/haptics.js';

export function useSwipeAction({ onSwipeRight, onSwipeLeft, threshold = 76, disabled = false }) {
  const firedRef = useRef(false);
  const bind = useDrag(({ down, movement: [x, y], cancel, last, event }) => {
    if (disabled || Math.abs(y) > Math.abs(x) * 0.8) return;
    if (down && Math.abs(x) > threshold && !firedRef.current) {
      firedRef.current = true;
      if (event.cancelable) event.preventDefault();
    }
    if (!last) return;
    const callback = x >= threshold ? onSwipeRight : x <= -threshold ? onSwipeLeft : null;
    if (Math.abs(x) >= threshold && callback) { triggerHaptic('light'); callback(); }
    firedRef.current = false;
  }, { axis: 'x', filterTaps: true, pointer: { touch: true }, threshold: 12, rubberband: false });

  const style = useMemo(() => ({ touchAction: 'pan-y' }), []);
  return useCallback(() => ({ ...bind(), style }), [bind, style]);
}
