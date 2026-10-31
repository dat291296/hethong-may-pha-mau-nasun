import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * SafePortal component that ensures createPortal is only executed 
 * on the client-side after DOM has fully mounted, preventing React Error #299.
 */
export default function SafePortal({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined' || !document.body) {
    return null;
  }

  return createPortal(children, document.body);
}
