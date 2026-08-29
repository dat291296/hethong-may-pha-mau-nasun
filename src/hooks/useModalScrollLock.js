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

      // Reset scroll position of all modal bodies to top
      const timer = setTimeout(() => {
        document.querySelectorAll('.modal-body').forEach(el => {
          el.scrollTop = 0;
        });
        // Auto-focus first visible input or select inside modal
        const firstInput = document.querySelector('.modal-body input:not([type="hidden"]), .modal-body select');
        if (firstInput && typeof firstInput.focus === 'function') {
          firstInput.focus({ preventScroll: true });
        }
      }, 50);

      return () => {
        document.body.style.overflow = originalOverflow;
        clearTimeout(timer);
      };
    }
  }, [isOpen]);
}
