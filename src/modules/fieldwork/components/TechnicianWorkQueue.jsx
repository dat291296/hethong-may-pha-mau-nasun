import { useContext, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronRight, MapPin, QrCode, RefreshCw, Wrench } from 'lucide-react';
import { useAuth } from '../../../shared/context/AuthContext.jsx';
import { WorkspaceRegionContext } from '../../../shared/hooks/useWorkspaceState.js';
import { inManagedRegion, isAssignedTo, repairNeedsAction, taskPriority, normalizeRegion } from '../lib/teamWorkspace.js';

function dateLabel(value) {
  if (!value) return 'Chưa đặt hạn';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function taskDescription(task) {
  if (task.label === 'Sửa chữa') return 'Kiểm tra lỗi và cập nhật kết quả xử lý';
  if (task.label === 'Chờ gửi trả') return 'Liên hệ NPP, giao trả và xác nhận hoàn tất';
  return 'Hẹn NPP, kiểm tra máy và cập nhật lịch bảo trì';
}

export default function TechnicianWorkQueue({ repairTickets = [], systemSets = [], npps = [], teamUsers = [], onNavigate, onOpenQrScan, onOpenRouteMap, onRefresh }) {
  const { user } = useAuth();
  const workspaceRegion = useContext(WorkspaceRegionContext);
  const [scope, setScope] = useState(user?.role === 'technician' ? 'MINE' : 'ALL');
  const [filter, setFilter] = useState('ALL');
  const today = new Date().toLocaleDateString('en-CA');
  const upcomingDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toLocaleDateString('en-CA');
  }, []);

  const tasks = useMemo(() => [
    ...repairTickets.filter(repairNeedsAction).map(item => ({
      item,
      tab: 'repairs',
      code: item.ticketCode || item.id,
      title: item.nppName || 'Chưa có NPP',
      nppId: item.nppId || item.npp_id,
      npp: npps.find(npp => String(npp.id) === String(item.nppId || item.npp_id)),
      due: item.assignmentDueDate || item.slaDueAt?.slice(0, 10),
      label: item.processingStatus === 'Đã xử lý' ? 'Chờ gửi trả' : 'Sửa chữa',
      icon: Wrench,
    })),
    ...systemSets
      .filter(item => ['DA_LAP_DAT', 'BAO_THUONG_BAO_TRI'].includes(item.status) && item.nextMaintenanceDue && item.nextMaintenanceDue <= upcomingDate)
      .map(item => ({
        item,
        tab: 'maintenance',
        code: item.setCode,
        title: item.nppName || 'Chưa có NPP',
        nppId: item.nppId || item.npp_id,
        npp: npps.find(npp => String(npp.id) === String(item.nppId || item.npp_id)),
        due: item.nextMaintenanceDue,
        label: 'Bảo trì',
        icon: CalendarClock,
      })),
  ].filter(task => inManagedRegion(task.item, user, npps, systemSets))
    .sort((a, b) => taskPriority(a, today) - taskPriority(b, today) || (a.due || '9999').localeCompare(b.due || '9999')), [repairTickets, systemSets, upcomingDate, user, npps, today]);

  const filteredTasks = tasks.filter(task => {
    if (scope === 'MINE' && !isAssignedTo(task.item, user)) return false;
    if (filter === 'TODAY') return task.due === today;
    if (filter === 'OVERDUE') return task.due && task.due < today;
    if (filter === 'UPCOMING') return task.due && task.due > today;
    if (filter === 'MAINTENANCE') return task.label === 'Bảo trì';
    if (filter === 'REPAIR') return task.label !== 'Bảo trì';
    return true;
  });

  const incomplete = systemSets.filter(machine => inManagedRegion(machine, user, npps)).map(machine => {
    const npp = npps.find(item => item.id === machine.nppId);
    const fields = [];
    if (['DA_LAP_DAT', 'BAO_THUONG_BAO_TRI'].includes(machine.status)) {
      if (!machine.dispenserSerial) fields.push('Seri máy chiết');
      if (!machine.mixerSerial) fields.push('Seri máy lắc');
      if (!machine.nextMaintenanceDue) fields.push('Hạn bảo trì');
      if (!npp?.phone) fields.push('Liên hệ NPP');
      if (!npp?.address) fields.push('Địa chỉ');
    }
    return { machine, fields };
  }).filter(item => item.fields.length);

  const counts = {
    all: tasks.length,
    mine: tasks.filter(task => isAssignedTo(task.item, user)).length,
    overdue: tasks.filter(task => task.due && task.due < today).length,
    today: tasks.filter(task => task.due === today).length,
  };
  const regionLabel = user?.role === 'technician' ? normalizeRegion(user.managedRegion) || 'Chưa phân công miền' : workspaceRegion === 'ALL' ? 'Toàn quốc' : workspaceRegion;

  return (
    <section className="technician-work-queue" aria-labelledby="technician-work-queue-title">
      <header className="work-queue-hero glass-panel">
        <div>
          <p className="eyebrow">TRUNG TÂM CÔNG VIỆC</p>
          <h1 id="technician-work-queue-title">Công việc hôm nay</h1>
          <p>{user?.name || 'Kỹ thuật viên'} · {regionLabel}</p>
        </div>
        <div className="work-queue-hero-actions">
          {onOpenQrScan && <button type="button" className="btn btn-primary" onClick={onOpenQrScan}><QrCode size={18} /> Quét QR</button>}
          {onRefresh && <button type="button" className="btn btn-secondary" onClick={onRefresh} aria-label="Tải lại công việc"><RefreshCw size={18} /> Tải lại</button>}
        </div>
      </header>

      <div className="work-queue-stats" aria-label="Tóm tắt công việc">
        <button type="button" className={`work-queue-stat ${counts.overdue ? 'is-danger' : ''}`} onClick={() => setFilter('OVERDUE')}><strong>{counts.overdue}</strong><span>Quá hạn</span></button>
        <button type="button" className="work-queue-stat" onClick={() => setFilter('TODAY')}><strong>{counts.today}</strong><span>Hôm nay</span></button>
        <button type="button" className="work-queue-stat" onClick={() => setFilter('ALL')}><strong>{counts.all}</strong><span>Tổng việc</span></button>
        <div className="work-queue-stat"><strong>{incomplete.length}</strong><span>Thiếu dữ liệu</span></div>
      </div>

      <div className="work-queue-toolbar" role="toolbar" aria-label="Lọc công việc">
        <div className="work-queue-segments">
          <button type="button" aria-pressed={scope === 'MINE'} onClick={() => setScope('MINE')}>Việc của tôi ({counts.mine})</button>
          <button type="button" aria-pressed={scope === 'ALL'} onClick={() => setScope('ALL')}>{['admin', 'viewer'].includes(user?.role) ? 'Toàn đội' : 'Trong miền'} ({counts.all})</button>
        </div>
        <select className="form-select" aria-label="Lọc loại công việc" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="ALL">Tất cả việc</option>
          <option value="TODAY">Hôm nay</option>
          <option value="OVERDUE">Quá hạn</option>
          <option value="UPCOMING">Sắp tới</option>
          <option value="REPAIR">Sửa chữa / gửi trả</option>
          <option value="MAINTENANCE">Bảo trì</option>
        </select>
      </div>

      <div className="work-queue-list" aria-live="polite">
        {filteredTasks.map(task => {
          const Icon = task.icon;
          const overdue = task.due && task.due < today;
          const owner = task.item.assignedUserId ? teamUsers.find(person => person.id === task.item.assignedUserId)?.name : task.item.technician;
          return <article className={`work-queue-card ${overdue ? 'is-overdue' : ''}`} key={`${task.tab}:${task.code}`}>
            <div className="work-queue-card-icon"><Icon size={21} aria-hidden="true" /></div>
            <div className="work-queue-card-main">
              <div className="work-queue-card-top"><span className={`badge ${overdue ? 'badge-danger' : task.due === today ? 'badge-warning' : 'badge-info'}`}>{task.label}{overdue ? ' · Quá hạn' : ''}</span><time dateTime={task.due || undefined}>{dateLabel(task.due)}</time></div>
              <h2>{task.title}</h2>
              <p><strong>{task.code}</strong> · {taskDescription(task)}</p>
              <small>Phụ trách: {owner || 'Chưa phân công'}</small>
            </div>
            <div className="work-queue-actions">
              {task.npp?.phone && <a className="btn btn-secondary" href={`tel:${task.npp.phone}`} aria-label={`Gọi ${task.title}`}>Gọi NPP</a>}
              {task.nppId && onOpenRouteMap && <button type="button" className="btn btn-secondary" onClick={onOpenRouteMap}><MapPin size={16} /> Bản đồ</button>}
              <button type="button" className="btn btn-primary work-queue-open" onClick={() => onNavigate?.(task.tab, task.code)}><span>Mở việc</span><ChevronRight size={18} aria-hidden="true" /></button>
            </div>
          </article>;
        })}
        {!filteredTasks.length && <div className="work-queue-empty glass-panel"><CheckCircle2 size={34} aria-hidden="true" /><h2>Không có việc cần xử lý</h2><p>Thử chuyển sang “Trong miền” hoặc đổi bộ lọc để xem các công việc khác.</p></div>}
      </div>

      {incomplete.length > 0 && <details className="work-queue-data-quality glass-panel"><summary><span>Hồ sơ cần bổ sung</span><strong>{incomplete.length}</strong></summary><p>Bổ sung khi đi hiện trường; dữ liệu thiếu không đồng nghĩa máy bị hỏng.</p>{incomplete.slice(0, 8).map(({ machine, fields }) => <div className="work-queue-quality-row" key={machine.setCode}><div><strong>{machine.nppName || 'Chưa có NPP'} · {machine.setCode}</strong><span>{fields.join(' · ')}</span></div><button type="button" className="btn btn-secondary" onClick={() => onNavigate?.('assets', machine.setCode)}>Mở hồ sơ</button></div>)}</details>}
      {onOpenRouteMap && filteredTasks.some(task => task.item.nppId) && <button type="button" className="btn btn-secondary work-queue-route" onClick={onOpenRouteMap}><MapPin size={18} /> Lập tuyến công việc</button>}
    </section>
  );
}
