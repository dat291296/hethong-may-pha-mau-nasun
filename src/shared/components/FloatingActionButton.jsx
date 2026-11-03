import React from 'react';

export default function FloatingActionButton({ icon, label, onClick, disabled = false }) {
  const Icon = icon;
  return <button type="button" className="nasun-fab touch-target-min" aria-label={label} title={label} onClick={onClick} disabled={disabled}>{Icon && <Icon size={22} aria-hidden="true" />}<span>{label}</span></button>;
}
