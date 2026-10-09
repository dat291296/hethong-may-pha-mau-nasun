import React from 'react';
import { contactLinks } from '../lib/technicalResources.js';
const labels = {dispenser:'Máy chiết', mixer:'Máy lắc', computer:'Máy tính', printer:'Máy in'};

export function MachineProfileSummary({machine, profile}) {
  const links = contactLinks(profile.npp || {});
  return <section className="machine-summary" aria-label="Tổng quan hồ sơ máy">
    <div className="machine-summary-context"><strong>{machine.setCode}</strong><span>{profile.npp?.name || machine.nppName || 'Kho tổng trung tâm'}</span><span>{machine.province || machine.region || 'Chưa ghi nhận khu vực'}</span></div>
    <div className="machine-summary-grid">{profile.devices.map(({category,device}) => <article key={category}>
      <span>{labels[category]}</span><strong>{device?.model || machine[category+'Model'] || (category === 'computer' && machine.computerType) || 'Chưa có model'}</strong>
      <code>Seri: {device?.serial || machine[category+'Serial'] || 'Chưa ghi nhận'}</code>
      {!device && <small>Chưa xác định được liên kết thiết bị. Cần kiểm tra trước khi sửa.</small>}
    </article>)}</div>
    <div className="machine-summary-contact"><strong>Liên hệ NPP</strong><span>{profile.npp?.contactPerson || 'Chưa ghi nhận người liên hệ'}</span><span>{profile.npp?.phone || 'Chưa ghi nhận số điện thoại'}</span><span>{profile.npp?.address || 'Chưa ghi nhận địa chỉ'}</span><div className="machine-contact-actions">{links.phone && <a className="btn btn-secondary" href={links.phone}>Gọi NPP</a>}{links.email && <a className="btn btn-secondary" href={links.email}>Email NPP</a>}</div></div>
  </section>;
}
export function MachineProfileHistory({items}) {
  return <section aria-label="Lịch sử máy">{items.length ? items.map(item => {
    const date = item.at ? new Date(item.at) : null;
    const validDate = date && Number.isFinite(date.getTime());
    return <article className="machine-history" key={item.key}><strong>{item.title}</strong><time dateTime={validDate ? date.toISOString() : undefined}>{validDate ? date.toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận thời gian'}</time><p>{item.detail || 'Chưa có mô tả'}</p><span className="badge">{item.status || 'Đã ghi nhận'}</span></article>;
  }) : <p className="resource-muted">Chưa có lịch sử được liên kết chắc chắn với bộ máy này.</p>}</section>;
}
