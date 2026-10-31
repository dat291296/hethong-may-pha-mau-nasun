import { useEffect, useLayoutEffect } from 'react';

/**
 * Custom hook to lock body scrolling when a modal is open,
 * and aggressively reset modal-body scroll position to 0 immediately.
 */
export function useModalScrollLock(isOpen) {
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const resetScroll = () => {
        document.querySelectorAll('.modal-body, .modal-content, .modal-container').forEach(el => {
          if (el) el.scrollTop = 0;
        });
      };

      // Reset immediately & on animation frames
      resetScroll();
      requestAnimationFrame(resetScroll);
      const t1 = setTimeout(resetScroll, 10);
      const t2 = setTimeout(resetScroll, 50);
      const t3 = setTimeout(resetScroll, 150);

      return () => {
        document.body.style.overflow = originalOverflow;
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [isOpen]);
}

