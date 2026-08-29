import { useEffect } from 'react';

/**
 * Custom hook to lock body scrolling when a modal is open,
 * and automatically reset modal-body scroll position to top.
 */
export function useModalScrollLock(isOpen) {
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Reset scroll position of all modal bodies to top immediately
      const timer = setTimeout(() => {
        document.querySelectorAll('.modal-body').forEach(el => {
          el.scrollTop = 0;
        });
      }, 30);

      return () => {
        document.body.style.overflow = originalOverflow;
        clearTimeout(timer);
      };
    }
  }, [isOpen]);
}
