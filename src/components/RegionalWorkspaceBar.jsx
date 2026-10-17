import { useState } from 'react';
import { defaultWorkspaceRegion, WORKSPACE_REGIONS } from '../lib/regionalWorkspace.js';

export default function RegionalWorkspaceBar({ user, region, onChange, counts, extra, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const home = defaultWorkspaceRegion(user);
  const technician = user.role === 'technician' && home !== 'ALL';
  const button = value => <button type="button" key={value} aria-pressed={region === value} title={value === 'ALL' ? 'Toàn quốc' : value} onClick={() => onChange(value)}>{value === 'ALL' ? 'Toàn quốc' : value === 'UNASSIGNED' ? 'Kho / chưa xác định miền' : compact ? value.replace('Miền ', '') : value}{!compact && counts[value] != null && <span> · {counts[value]} NPP</span>}</button>;
  return <section className={`glass-panel regional-workspace${compact ? ' regional-workspace-compact' : ''}`} aria-label="Phạm vi miền">
    <div className="regional-primary"><div className="filter-quick">{technician ? button(home) : [button('ALL'), ...WORKSPACE_REGIONS.map(button)]}{technician && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn miền khác' : 'Xem miền khác'}{region !== home && !expanded ? ` · ${region === 'ALL' ? 'Toàn quốc' : region}` : ''}</button>}{!technician && !compact && button('UNASSIGNED')}</div>{extra}</div>
    {technician && expanded && <div className="filter-quick">{WORKSPACE_REGIONS.filter(value => value !== home).map(button)}{button('ALL')}{button('UNASSIGNED')}</div>}
    {technician && <p>{region === home ? `Ưu tiên thông tin ${home}.` : 'Đang xem phạm vi khác.'} Bạn chỉ được chỉnh sửa dữ liệu thuộc {home}.</p>}
  </section>;
}
