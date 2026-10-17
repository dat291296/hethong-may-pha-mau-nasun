import { WorkspaceRegionContext } from '../hooks/useWorkspaceState.js';
import { useContext, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isAssignedTo, repairNeedsAction, missingMachineFields, inManagedRegion, normalizeRegion, taskPriority } from '../lib/teamWorkspace';

export default function TeamWorkPanel({ repairTickets, systemSets, npps, onNavigate, teamUsers }) {
  const { user } = useAuth();
  const workspaceRegion = useContext(WorkspaceRegionContext);
  const [scope, setScope] = useState(user?.role === 'technician' ? 'MINE' : 'ALL');
  const [period, setPeriod] = useState('ALL');
  const [limit, setLimit] = useState(3);
  const today = new Date().toLocaleDateString('en-CA');
  const upcoming = new Date(); upcoming.setDate(upcoming.getDate() + 30);
  const upcomingDate = upcoming.toLocaleDateString('en-CA');
  const tasks = useMemo(() => [
    ...repairTickets.filter(repairNeedsAction).map(item => ({ item, tab: 'repairs', code: item.ticketCode, title: item.nppName, due: item.assignmentDueDate || item.slaDueAt?.slice(0, 10), label: item.processingStatus === 'Đã xử lý' ? 'Chờ gửi trả' : 'Sửa chữa' })),
    ...systemSets.filter(item => ['DA_LAP_DAT', 'BAO_THUONG_BAO_TRI'].includes(item.status) && item.nextMaintenanceDue && item.nextMaintenanceDue <= upcomingDate).map(item => ({ item, tab: 'assets', code: item.setCode, title: item.nppName, due: item.nextMaintenanceDue, label: 'Bảo trì' })),
  ].filter(task => inManagedRegion(task.item, user, npps, systemSets)).sort((a, b) => taskPriority(a, today) - taskPriority(b, today) || (a.due || '9999').localeCompare(b.due || '9999')), [repairTickets, systemSets, upcomingDate, user, npps, today]);
  const filtered = tasks.filter(task => (scope === 'ALL' || isAssignedTo(task.item, user)) && (period === 'ALL' || (period === 'TODAY' ? task.due === today : task.due && task.due < today)));
  const incomplete = systemSets.filter(machine => inManagedRegion(machine, user, npps)).map(machine => {
    const npp = npps.find(item => item.id === machine.nppId);
    const fields = missingMachineFields(machine);
    if (['DA_LAP_DAT', 'BAO_THUONG_BAO_TRI'].includes(machine.status)) { if (!npp?.phone) fields.push('Liên hệ NPP'); if (!npp?.address) fields.push('Địa chỉ'); }
    return { machine, fields };
  }).filter(item => item.fields.length);
  return <section className="glass-panel team-work" aria-label="Công việc đội kỹ thuật">
    <div className="team-compact-heading"><h2>Nắm việc cần xử lý <span>{filtered.length}</span></h2><span className="team-scope-label">{user?.role === 'technician' ? normalizeRegion(user.managedRegion) || 'Chưa phân công miền' : workspaceRegion === 'ALL' ? 'Toàn quốc' : workspaceRegion}</span></div>
    <div className="workspace-tabs"><button aria-pressed={scope === 'MINE'} onClick={() => { setScope('MINE'); setLimit(3); }}>Việc của tôi ({tasks.filter(task => isAssignedTo(task.item, user)).length})</button><button aria-pressed={scope === 'ALL'} onClick={() => { setScope('ALL'); setLimit(3); }}>{['admin', 'viewer'].includes(user?.role) ? 'Toàn đội' : 'Trong miền'} ({tasks.length})</button><select aria-label="Lọc hạn công việc" className="form-select" value={period} onChange={event => { setPeriod(event.target.value); setLimit(3); }}><option value="ALL">Mọi hạn xử lý</option><option value="TODAY">Hôm nay</option><option value="OVERDUE">Quá hạn</option></select></div>
    <div className="team-compact-list">{filtered.slice(0, limit).map(task => <article className="team-compact-task" key={`${task.tab}:${task.code}`}>
      <span className={`badge ${task.due && task.due < today ? 'badge-danger' : 'badge-warning'}`}>{task.label}{task.due && task.due < today ? ' · Quá hạn' : ''}</span>
      <div className="team-task-copy"><strong>{task.title || 'Chưa có NPP'}</strong><span>{task.code} · {task.due || 'Chưa đặt hạn'}</span></div>
      <button className="btn btn-secondary" aria-label={`Mở ${task.code}`} onClick={() => onNavigate(task.tab, task.code)}>Mở →</button>
      <details className="team-task-details"><summary>Chi tiết công việc</summary><p>{task.label === 'Sửa chữa' ? 'Kiểm tra lỗi, xử lý và cập nhật phiếu' : task.label === 'Chờ gửi trả' ? 'Liên hệ NPP, giao trả và cập nhật xác nhận' : 'Hẹn NPP, kiểm tra và cập nhật lịch bảo trì'}</p><p>Phụ trách: {task.item.assignedUserId ? (teamUsers.find(person => person.id === task.item.assignedUserId)?.name || 'Tài khoản được giao') : task.item.technician || 'Chưa phân công'}</p></details>
    </article>)}</div>
    {!filtered.length && <p className="workspace-empty">Không có việc trong bộ lọc này. Chọn trong miền/toàn đội để xem việc chưa giao.</p>}
    {filtered.length > limit && <button className="btn btn-secondary" onClick={() => setLimit(value => value + 10)}>Xem thêm công việc</button>}
    <details className="data-quality"><summary>Cần bổ sung dữ liệu ({incomplete.length} bộ máy)</summary><p>Bổ sung khi đi hiện trường; chưa có thông tin không đồng nghĩa máy bị hỏng.</p>{incomplete.map(({ machine, fields }) => <div className="workspace-task-row" key={machine.setCode}><div><strong>{machine.nppName} · {machine.setCode}</strong><p>{fields.join(' · ')}</p></div><button className="btn btn-secondary" onClick={() => onNavigate('assets', machine.setCode)}>Mở hồ sơ</button></div>)}</details>
  </section>;
}
