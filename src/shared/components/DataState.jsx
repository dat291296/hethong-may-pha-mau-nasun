import React from 'react';

export function DataLoadingState({ label = 'Đang tải dữ liệu…' }) {
  return <section className="data-loading-state glass-panel" role="status" aria-live="polite" aria-busy="true">
    <p>{label}</p><div aria-hidden="true">{[0, 1, 2].map(row => <div className="skeleton data-loading-line" key={row} />)}</div>
  </section>;
}

export function EmptyState({ title = 'Chưa có dữ liệu phù hợp', description, actionLabel, onAction }) {
  return <section className="data-empty-state" role="status">
    <strong>{title}</strong><p>{description}</p>
    {onAction && <button type="button" className="btn btn-secondary" onClick={onAction}>{actionLabel || 'Bỏ bộ lọc'}</button>}
  </section>;
}

export function InputFeedback({ id, message }) {
  return <small id={id} className="resource-error" aria-live="polite">{message || ''}</small>;
}
