import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isAssignedTo, repairNeedsAction, missingMachineFields } from '../lib/teamWorkspace';

export default function TeamWorkPanel({ repairTickets, systemSets, npps, onNavigate, teamUsers }) {
  const { user } = useAuth();
  const manager = ['admin', 'manager'].includes(user?.role);
  const [scope, setScope] = useState(manager ? 'ALL' : 'MINE');
  const [period, setPeriod] = useState('ALL');
  const [limit, setLimit] = useState(3);
  const today = new Date().toLocaleDateString('en-CA');
  const upcoming = new Date(); upcoming.setDate(upcoming.getDate() + 30);
  const upcomingDate = upcoming.toLocaleDateString('en-CA');
  const tasks = useMemo(() => [
    ...repairTickets.filter(repairNeedsAction).map(item => ({ item, tab: 'repairs', code: item.ticketCode, title: item.nppName, due: item.assignmentDueDate || item.slaDueAt?.slice(0, 10), label: item.processingStatus === 'Đã xử lý' ? 'Chờ gửi trả' : 'Sửa chữa' })),
    ...systemSets.filter(item => ['DA_LAP_DAT', 'BAO_THUONG_BAO_TRI'].includes(item.status) && item.nextMaintenanceDue && item.nextMaintenanceDue <= upcomingDate).map(item => ({ item, tab: 'assets', code: item.setCode, title: item.nppName, due: item.nextMaintenanceDue, label: 'Bảo trì' })),
  ].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')), [repairTickets, systemSets, upcomingDate]);
  const filtered = tasks.filter(task => (scope === 'ALL' || isAssignedTo(task.item, user)) && (period === 'ALL' || (period === 'TODAY' ? task.due === today : task.due && task.due < today)));
  const incomplete = systemSets.map(machine => {
    const npp = npps.find(item => item.id === machine.nppId);
    const fields = missingMachineFields(machine);
    if (['DA_LAP_DAT', 'BAO_THUONG_BAO_TRI'].includes(machine.status)) { if (!npp?.phone) fields.push('Liên hệ NPP'); if (!npp?.address) fields.push('Địa chỉ'); if (!machine.installationPhotos?.length) fields.push('Ảnh hiện trường'); }
    return { machine, fields };
  }).filter(item => item.fields.length);
  return <section className="glass-panel team-work" aria-label="Công việc đội kỹ thuật">
    <div className="workspace-section-heading"><div><h2>{scope === 'MINE' ? 'Việc của tôi' : 'Công việc đội kỹ thuật'} ({filtered.length})</h2><p>Người phụ trách, hạn xử lý và cập nhật gần nhất.</p></div></div>
    <div className="workspace-tabs"><button aria-pressed={scope === 'MINE'} onClick={() => { setScope('MINE'); setLimit(3); }}>Việc của tôi</button><button aria-pressed={scope === 'ALL'} onClick={() => { setScope('ALL'); setLimit(3); }}>{manager ? 'Toàn đội' : 'Trong khu vực'}</button><select aria-label="Lọc hạn công việc" className="form-select" value={period} onChange={event => { setPeriod(event.target.value); setLimit(3); }}><option value="ALL">Mọi hạn xử lý</option><option value="TODAY">Hôm nay</option><option value="OVERDUE">Quá hạn</option></select></div>
    {filtered.slice(0, limit).map(task => <div className="workspace-task-row" key={`${task.tab}:${task.code}`}><div><strong>{task.title}</strong><p>{task.code} · {task.item.machineModel || task.item.dispenserModel}</p><span className={`badge ${task.due && task.due < today ? 'badge-danger' : 'badge-warning'}`}>{task.label} · {task.due || 'Chưa đặt hạn'}</span><p>Phụ trách: {task.item.assignedUserId ? (teamUsers.find(person => person.id === task.item.assignedUserId)?.name || 'Tài khoản được giao') : task.item.technician || 'Chưa phân công'}{task.item.lastUpdatedAt ? ` · Cập nhật ${new Date(task.item.lastUpdatedAt).toLocaleString('vi-VN')}` : ''}</p></div><button className="btn btn-secondary" onClick={() => onNavigate(task.tab, task.code)}>Mở</button></div>)}
    {!filtered.length && <p className="workspace-empty">Không có công việc phù hợp. Phiếu cũ chưa gán tài khoản được đối chiếu theo tên kỹ thuật viên.</p>}
    {filtered.length > limit && <button className="btn btn-secondary" onClick={() => setLimit(value => value + 10)}>Xem thêm công việc</button>}
    <details className="data-quality"><summary>Cần bổ sung dữ liệu ({incomplete.length} bộ máy)</summary><p>Bổ sung khi đi hiện trường; chưa có thông tin không đồng nghĩa máy bị hỏng.</p>{incomplete.map(({ machine, fields }) => <div className="workspace-task-row" key={machine.setCode}><div><strong>{machine.nppName} · {machine.setCode}</strong><p>{fields.join(' · ')}</p></div><button className="btn btn-secondary" onClick={() => onNavigate('assets', machine.setCode)}>Mở hồ sơ</button></div>)}</details>
  </section>;
}
