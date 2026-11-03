import React, { useEffect } from 'react';
import SafePortal from './SafePortal.jsx';
import { X } from 'lucide-react';

export default function BottomSheet({ open, title, onClose, children, footer, className = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <SafePortal>
      <div className="modal-overlay bottom-sheet-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
        <section className={`modal-content bottom-sheet ${className}`} role="dialog" aria-modal="true" aria-label={title}>
          <div className="bottom-sheet-handle" aria-hidden="true" />
          <header className="modal-header"><h2>{title}</h2><button type="button" className="btn btn-secondary touch-target-min" onClick={onClose} aria-label="Đóng"><X size={18} /></button></header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </section>
      </div>
    </SafePortal>
  );
}
