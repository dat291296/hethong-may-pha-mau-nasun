import { EmptyState } from '../../../shared/components/DataState.jsx';
import React, { useEffect, useMemo, useRef } from 'react';
import { Edit3, Trash2, Camera, Image as ImageIcon, Eye } from 'lucide-react';
import { getSystemSetMissingFields } from '../utils/systemSetValidation.js';
import { isStabilizerMissing, STABILIZER_MISSING, STABILIZER_NPP } from '../lib/stabilizer.js';
import LazyImage from '../../../shared/components/LazyImage.jsx';
import { useSwipeAction } from '../../../shared/hooks/useSwipeAction.js';

function SwipeableAssetCard({ children, onSwipeRight, onSwipeLeft, disabled }) {
  const bind = useSwipeAction({ onSwipeRight, onSwipeLeft, disabled });
  return <div {...bind()} className="mobile-card swipeable-card">{children}</div>;
}

export default function AssetInventoryTables({ onResetFilters, activeSubTab, computers, dispensers, filteredSets, getAssignedInfo, getPaginatedList, getSetPhotos, handleDeleteDevice, handleDeleteSet, handleOpenEditDevice, handleOpenEditSet, incompleteSystemSets, looseInventoryGroups, mixers, printers, renderDeviceFilterBar, renderIssuedSerial, renderPaginationBar, setSelectedPhotoViewer, setSelectedSetDetails, sortedComputers, sortedDispensers, sortedMixers, sortedPrinters, stockBundleSummary, stockSets, hasNextPage = false, loadNextPage, onRequestRepair, canCreateRepair = false }) {
  const computerById = useMemo(() => new Map((computers || []).map(computer => [computer.id, computer])), [computers]);
  const printerById = useMemo(() => new Map((printers || []).map(printer => [printer.id, printer])), [printers]);
  const printerBySerial = useMemo(() => {
    const index = new Map();
    for (const printer of printers || []) {
      if (printer.serial && !index.has(printer.serial)) index.set(printer.serial, printer);
    }
    return index;
  }, [printers]);
  const infiniteSentinelRef = useRef(null);
  useEffect(() => {
    const sentinel = infiniteSentinelRef.current;
    const root = sentinel?.closest('.nasun-workspace');
    if (!sentinel || !root || !hasNextPage || !('IntersectionObserver' in window) || window.innerWidth > 768) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadNextPage?.();
    }, { root, rootMargin: '0px 0px 20% 0px', threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeSubTab, hasNextPage, loadNextPage]);
  const count = ({ comboSets: filteredSets, dispensers: sortedDispensers, mixers: sortedMixers, computers: sortedComputers, printers: sortedPrinters }[activeSubTab] || []).length;
  return (<>{count === 0 && <EmptyState title="Chưa có thiết bị phù hợp" description="Bỏ bộ lọc hoặc chọn Thêm thiết bị để ghi nhận máy trong kho." onAction={onResetFilters} />}{/* VIEW 1: COMBO SETS MANAGEMENT */}
      {activeSubTab === 'comboSets' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <details style={{ padding: '14px', marginBottom: '16px', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '10px', background: 'rgba(245,158,11,0.08)' }}>
            <summary style={{ cursor: 'pointer' }}>Bộ máy tự do trong kho: {stockBundleSummary.completeFromLooseDevices} bộ · Mở chi tiết</summary>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: '800', color: '#f59e0b' }}>📦 Bộ máy tự do trong kho: {stockBundleSummary.completeFromLooseDevices} bộ</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Tính tự động từ thiết bị chưa ghép NPP; không tự tạo hoặc thay đổi dữ liệu bộ máy.</div>
              </div>
              <span className="badge badge-info">Đã ghép sẵn trong kho: {stockSets.length} bộ</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', marginTop: '12px' }}>
              {looseInventoryGroups.map(group => (
                <div key={group.key} style={{ padding: '10px', borderRadius: '8px', background: 'rgba(15,23,42,0.55)', borderLeft: `3px solid ${group.color}` }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: group.color }}>{group.icon} {group.label}: {group.items.length}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                    {group.items.length === 0 ? 'Không có thiết bị lẻ' : group.items.slice(0, 4).map(item => <div key={item.id}>• {group.getName(item)}</div>)}
                    {group.items.length > 4 && <div>+ {group.items.length - 4} thiết bị khác</div>}
                  </div>
                </div>
              ))}
            </div>
          </details>
          {incompleteSystemSets.length > 0 && (
            <div style={{ padding: '12px 14px', marginBottom: '16px', border: '1px solid rgba(239,68,68,0.45)', borderRadius: '10px', background: 'rgba(239,68,68,0.10)', color: '#fecaca', fontSize: '0.8rem' }}>
              <strong>⚠️ {incompleteSystemSets.length} bộ máy thiếu dữ liệu cần bổ sung khi đi NPP/bảo dưỡng.</strong>
              <span style={{ marginLeft: '6px', color: 'var(--text-secondary)' }}>Cảnh báo áp dụng cho mọi trạng thái bộ máy.</span>
            </div>
          )}


          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã Bộ Máy</th>
                  <th style={{ minWidth: '130px' }}>Ảnh Hiện Trường</th>
                  <th>Nhà Phân Phối</th>
                  <th>Máy Chiết (Seri)</th>
                  <th>Máy Lắc (Seri)</th>
                  <th>Máy Tính (Cấu hình)</th>
                  <th>Máy In (Model/Seri)</th>
                  <th>Cán Bộ Phụ Trách</th>
                  <th>Ổn Áp (Ghi Nhận)</th>
                  <th>Trạng Thái</th>
                  <th>Thiếu Thông Tin</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(filteredSets).map(set => {
                  const missingFields = getSystemSetMissingFields(set);
                  const missingDispenserInfo = missingFields.filter(field => field.toLowerCase().includes('máy chiết'));
                  const missingMixerInfo = missingFields.filter(field => field.toLowerCase().includes('máy lắc'));
                  const missingPrinterInfo = missingFields.filter(field => field.toLowerCase().includes('máy in'));
                  const pcObj = set.computerId ? computerById.get(set.computerId) : undefined;
                  const pcSpecsText = pcObj?.specs || set.pcSpecs || (set.pcType ? `${set.pcType} (${set.pcOs || ''})` : set.computerType || 'Chưa có cấu hình');

                  const prnObj = (set.printerId ? printerById.get(set.printerId) : undefined)
                    || (set.printerSerial ? printerBySerial.get(set.printerSerial) : undefined);
                  const printerModelText = prnObj?.model || set.printerModel || 'QL700';
                  const printerSerialText = set.printerSerial || prnObj?.serial || 'Chưa có seri';
                  const photos = getSetPhotos(set);
                  const isDirect = (set.installationPhotos && set.installationPhotos.length > 0) || (set.installation_photos && set.installation_photos.length > 0);

                  return (
                    <tr key={set.id || set.setCode}>
                      <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{set.setCode}</td>
                      <td>
                        {photos.length === 0 ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.8 }}
                            onClick={() => handleOpenEditSet(set)}
                            title="Bấm để tải thêm ảnh cho bộ máy"
                          >
                            <Camera size={13} />
                            <span>+ Thêm ảnh</span>
                          </button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {photos.slice(0, 2).map((imgUrl, imgIdx) => (
                                <div
                                  key={imgIdx}
                                  onClick={() => setSelectedPhotoViewer({
                                    isOpen: true,
                                    photos: photos,
                                    activeIndex: imgIdx,
                                    title: `Ảnh ${imgIdx + 1}/${photos.length} - Bộ Máy [${set.setCode}] (${set.nppName || 'Kho Tổng'})`
                                  })}
                                  style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    border: '1.5px solid var(--border-color)',
                                    position: 'relative',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                                    flexShrink: 0
                                  }}
                                  title="Bấm để phóng to xem đầy đủ ảnh"
                                >
                                  <LazyImage
                                    src={imgUrl}
                                    alt={`Ảnh ${set.setCode}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                </div>
                              ))}
                            </div>
                            {photos.length > 2 && (
                              <button
                                type="button"
                                onClick={() => setSelectedPhotoViewer({
                                  isOpen: true,
                                  photos: photos,
                                  activeIndex: 0,
                                  title: `Bộ Máy [${set.setCode}] (${set.nppName || 'Kho Tổng'})`
                                })}
                                className="badge badge-info"
                                style={{ cursor: 'pointer', fontSize: '0.7rem', padding: '3px 6px', border: 'none' }}
                                title="Xem tất cả ảnh"
                              >
                                +{photos.length - 2}
                              </button>
                            )}
                            {!isDirect && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }} title="Ảnh liên kết từ NPP">🏢</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: '600' }}>{set.nppName || 'Kho Tổng Trung Tâm'}</td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{set.dispenserModel}</div>
                        {missingDispenserInfo.length > 0 ? (
                          <span className="badge badge-danger" style={{ marginTop: '4px', fontSize: '0.68rem' }} title={missingDispenserInfo.join(', ')}>⚠️ {missingDispenserInfo.join(', ')}</span>
                        ) : (
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.dispenserSerial}</div>
                        )}
                      </td>
                      <td>
                        <div>{set.mixerModel}</div>
                        {missingMixerInfo.length > 0 ? (
                          <span className="badge badge-danger" style={{ marginTop: '4px', fontSize: '0.68rem' }} title={missingMixerInfo.join(', ')}>⚠️ {missingMixerInfo.join(', ')}</span>
                        ) : (
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.mixerSerial}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{pcSpecsText}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <span>💻 {set.computerId || pcObj?.id || 'Máy Tính'}</span>
                          {(pcObj?.status === 'Đã đổi trả máy mới' || set.computerStatus === 'Đã đổi trả máy mới') && (
                            <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>🔄 Đã đổi trả máy mới</span>
                          )}
                          {(pcObj?.status === 'Đổi trả máy cũ' || pcObj?.status === 'Đã đổi trả máy cũ' || set.computerStatus === 'Đổi trả máy cũ' || set.computerStatus === 'Đã đổi trả máy cũ') && (
                            <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>🔁 Đổi trả máy cũ</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{printerModelText}</div>
                        {missingPrinterInfo.length > 0 ? (
                          <span className="badge badge-danger" style={{ marginTop: '4px', fontSize: '0.68rem' }} title={missingPrinterInfo.join(', ')}>⚠️ {missingPrinterInfo.join(', ')}</span>
                        ) : (
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Seri: {printerSerialText}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem', fontWeight: '600' }}>🛠️ {set.technician || 'Chưa gán KTV'}</div>
                        <div style={{ fontSize: '0.775rem', color: 'var(--accent-cyan)', marginTop: '2px' }}>💼 KD: {set.salesperson || 'Chưa gán NVKD'}</div>
                      </td>
                      <td>
                        {isStabilizerMissing(set.stabilizer) ? (
                          <span className="badge badge-warning">⚠️ {STABILIZER_MISSING}</span>
                        ) : (
                          <span className="badge badge-success">✓ {STABILIZER_NPP}</span>
                        )}
                      </td>
                      <td>
                        {set.status === 'DA_LAP_DAT' && <span className="badge badge-success">● Đã Lắp Đặt</span>}
                        {set.status === 'TRONG_KHO' && <span className="badge badge-info">● Trong Kho</span>}
                        {set.status === 'DA_THU_HOI' && <span className="badge badge-danger">● Đã Thu Hồi</span>}
                        {set.status === 'BAO_THUONG_BAO_TRI' && <span className="badge badge-warning">● Bảo Trì</span>}
                      </td>
                      <td>
                        {missingFields.length > 0 ? (
                          <span className="badge badge-danger" title={missingFields.join(', ')}>⚠️ {missingFields.length} mục thiếu</span>
                        ) : <span className="badge badge-success">✓ Đủ dữ liệu</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px' }}
                            onClick={() => setSelectedSetDetails(set)}
                            title="Xem chi tiết bộ máy & thư viện ảnh đầy đủ"
                          >
                            <Eye size={14} color="var(--accent-blue)" />
                          </button>
                          <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditSet(set)} title="Chỉnh sửa bộ máy">
                            <Edit3 size={14} color="var(--accent-cyan)" />
                          </button>
                          <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteSet(set.setCode)} title="Xóa bộ máy">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(filteredSets).map(set => {
              const missingFields = getSystemSetMissingFields(set);
              const missingDispenserInfo = missingFields.filter(field => field.toLowerCase().includes('máy chiết'));
              const missingMixerInfo = missingFields.filter(field => field.toLowerCase().includes('máy lắc'));
              const missingPrinterInfo = missingFields.filter(field => field.toLowerCase().includes('máy in'));
                  const pcObj = (computers || []).find(c => set.computerId && c.id === set.computerId);
              const pcSpecsText = pcObj?.specs || set.pcSpecs || (set.pcType ? `${set.pcType} (${set.pcOs || ''})` : set.computerType || 'Chưa có cấu hình');

              const prnObj = (printers || []).find(p => (set.printerId && p.id === set.printerId) || (set.printerSerial && p.serial === set.printerSerial));
              const printerModelText = prnObj?.model || set.printerModel || 'QL700';
              const printerSerialText = set.printerSerial || prnObj?.serial || 'Chưa có seri';
              const photos = getSetPhotos(set);

              return (
                <SwipeableAssetCard key={set.id || set.setCode} onSwipeRight={() => setSelectedSetDetails(set)} onSwipeLeft={() => canCreateRepair && onRequestRepair?.(set, 'equipment')} disabled={!canCreateRepair}>
                  <div className="mobile-card-header">
                    <div>
                      <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{set.setCode}</span>
                      <div className="mobile-card-subtitle">{set.nppName || 'Kho Tổng Trung Tâm'}</div>
                    </div>
                    <div>
                      {set.status === 'DA_LAP_DAT' && <span className="badge badge-success">🟢 Đã Lắp</span>}
                      {set.status === 'TRONG_KHO' && <span className="badge badge-info">🔵 Kho</span>}
                      {set.status === 'DA_THU_HOI' && <span className="badge badge-danger">🔴 Thu Hồi</span>}
                      {set.status === 'BAO_THUONG_BAO_TRI' && <span className="badge badge-warning">🟡 Bảo Trì</span>}
                    </div>
                  </div>
                  <div className="mobile-card-body">
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Máy Chiết:</span>
                      <span className="mobile-card-value">{set.dispenserModel} {missingDispenserInfo.length > 0 ? <span className="badge badge-danger">⚠️ {missingDispenserInfo.join(', ')}</span> : `(${set.dispenserSerial})`}</span>
                    </div>
                    <details className="mobile-extra"><summary>Thông tin thiết bị & phụ trách</summary>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Máy Lắc:</span>
                      <span className="mobile-card-value">{set.mixerModel} {missingMixerInfo.length > 0 ? <span className="badge badge-danger">⚠️ {missingMixerInfo.join(', ')}</span> : `(${set.mixerSerial})`}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Máy Tính:</span>
                      <span className="mobile-card-value">
                        {pcSpecsText}
                        {(pcObj?.status === 'Đã đổi trả máy mới' || set.computerStatus === 'Đã đổi trả máy mới') && (
                          <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🔄 Đã đổi trả máy mới</span>
                        )}
                        {(pcObj?.status === 'Đổi trả máy cũ' || pcObj?.status === 'Đã đổi trả máy cũ' || set.computerStatus === 'Đổi trả máy cũ' || set.computerStatus === 'Đã đổi trả máy cũ') && (
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🔁 Đổi trả máy cũ</span>
                        )}
                      </span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Máy In:</span>
                      <span className="mobile-card-value">{printerModelText} {missingPrinterInfo.length > 0 ? <span className="badge badge-danger">⚠️ {missingPrinterInfo.join(', ')}</span> : `(Seri: ${printerSerialText})`}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Cán bộ phụ trách:</span>
                      <span className="mobile-card-value">🛠️ KTV: {set.technician || 'Chưa gán'} | 💼 KD: {set.salesperson || 'Chưa gán'}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Ổn Áp:</span>
                      <span className="mobile-card-value">{isStabilizerMissing(set.stabilizer) ? <span className="badge badge-warning">⚠️ {STABILIZER_MISSING}</span> : <span className="badge badge-success">✓ {STABILIZER_NPP}</span>}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Dữ liệu cần bổ sung:</span>
                      <span className="mobile-card-value">{missingFields.length > 0 ? <span className="badge badge-danger">⚠️ {missingFields.join(', ')}</span> : <span className="badge badge-success">✓ Đủ dữ liệu</span>}</span>
                    </div>

                    {/* Attached Photos Strip on Mobile Card */}
                    {photos.length > 0 && (
                      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ImageIcon size={13} color="var(--accent-cyan)" />
                            <span>Ảnh Hiện Trường ({photos.length})</span>
                          </span>
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.725rem', cursor: 'pointer', padding: 0 }}
                            onClick={() => setSelectedPhotoViewer({
                              isOpen: true,
                              photos: photos,
                              activeIndex: 0,
                              title: `Bộ Máy [${set.setCode}]`
                            })}
                          >
                            Phóng to tất cả ↗
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                          {photos.map((url, idx) => (
                            <LazyImage
                              key={idx}
                              src={url}
                              alt={`Ảnh hiện trường ${idx + 1}`}
                              onClick={() => setSelectedPhotoViewer({
                                isOpen: true,
                                photos: photos,
                                activeIndex: idx,
                                title: `Ảnh ${idx + 1}/${photos.length} - [${set.setCode}]`
                              })}
                              style={{
                                width: '60px',
                                height: '60px',
                                borderRadius: '6px',
                                objectFit: 'cover',
                                border: '1px solid var(--border-color)',
                                flexShrink: 0,
                                cursor: 'pointer'
                              }}
                              fit="cover"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    </details>
                  </div>
                  <div className="mobile-card-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSetDetails(set)}>
                      <Eye size={14} color="var(--accent-blue)" />
                      <span>Chi tiết & Ảnh</span>
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditSet(set)}>
                      <Edit3 size={14} color="var(--accent-cyan)" />
                      <span>Sửa</span>
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSet(set.setCode)}>
                      <Trash2 size={14} />
                      <span>Xóa</span>
                    </button>
                  </div>
                </SwipeableAssetCard>
              );
            })}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(filteredSets.length)}
        </div>
      )}

      {/* VIEW 2: RAW DISPENSERS STOCK */}
      {activeSubTab === 'dispensers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '10px' }}>Danh Mục Máy Chiết (Kho & Đã Cấp Phát)</h3>
            {renderDeviceFilterBar('Máy Chiết', dispensers.length, false)}
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Hệ Máy / Model</th>
                  <th>Số Seri (Unique)</th>
                  <th>Tình Trạng Kỹ Thuật</th>
                  <th>Tình Trạng Cấp Phát</th>
                  <th>Mã Bộ Máy Gắn Vào</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(sortedDispensers).map(item => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: '700' }}>{item.id}</span>
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                    </td>
                    <td style={{ fontWeight: '700' }}>{item.model}</td>
                    <td>{renderIssuedSerial(item)}</td>
                    <td>
                      {item.status === 'Mới 100%' && <span className="badge badge-success">{item.status}</span>}
                      {item.status === 'Đang chạy tốt' && <span className="badge badge-info">{item.status}</span>}
                      {item.status === 'Cần bảo trì' && <span className="badge badge-warning">{item.status}</span>}
                      {item.status === 'Hỏng đầu phun' && <span className="badge badge-danger">⚠️ {item.status}</span>}
                    </td>
                    <td>
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? (
                          <div>
                            <span className="badge badge-success">🟢 Đã gán bộ</span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--accent-cyan)', marginTop: '2px' }}>{info.setCode}</div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>🏢 {info.nppName}</div>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">⚪ Tự do trong kho</span>
                        );
                      })()}
                    </td>
                    <td>{item.setCode || 'Chưa gán'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditDevice('dispenser', item)}>
                          <Edit3 size={14} color="var(--accent-cyan)" />
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteDevice('dispenser', item)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(sortedDispensers).map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">
                      {item.model}
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                    </span>
                    <div className="mobile-card-subtitle">Seri: {renderIssuedSerial(item)}</div>
                  </div>
                  <div>
                    {item.status === 'Mới 100%' && <span className="badge badge-success">{item.status}</span>}
                    {item.status === 'Đang chạy tốt' && <span className="badge badge-info">{item.status}</span>}
                    {item.status === 'Cần bảo trì' && <span className="badge badge-warning">{item.status}</span>}
                    {item.status === 'Hỏng đầu phun' && <span className="badge badge-danger">⚠️ {item.status}</span>}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Trạng thái cấp phát:</span>
                    <span className="mobile-card-value">
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? `🟢 Gán [${info.setCode}] (${info.nppName})` : '⚪ Tự do trong kho';
                      })()}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDevice('dispenser', item)}>
                    <Edit3 size={14} color="var(--accent-cyan)" />
                    <span>Sửa</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDevice('dispenser', item)}>
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(sortedDispensers.length)}
        </div>
      )}

      {/* VIEW 3: RAW MIXERS STOCK */}
      {activeSubTab === 'mixers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '10px' }}>Danh Mục Máy Lắc (Kho & Đã Cấp Phát)</h3>
            {renderDeviceFilterBar('Máy Lắc', mixers.length, false)}
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Hệ Máy</th>
                  <th>Loại Máy Lắc</th>
                  <th>Số Seri (Unique)</th>
                  <th>Tình Trạng Kỹ Thuật</th>
                  <th>Tình Trạng Cấp Phát & NPP</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(sortedMixers).map(item => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: '700' }}>{item.id}</span>
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                    </td>
                    <td style={{ fontWeight: '700' }}>{item.model}</td>
                    <td>{item.type}</td>
                    <td>{renderIssuedSerial(item)}</td>
                    <td><span className="badge badge-info">{item.status}</span></td>
                    <td>
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? (
                          <div>
                            <span className="badge badge-success">🟢 Đã gán bộ</span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--accent-cyan)', marginTop: '2px' }}>{info.setCode}</div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>🏢 {info.nppName}</div>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">⚪ Tự do trong kho</span>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditDevice('mixer', item)}>
                          <Edit3 size={14} color="var(--accent-cyan)" />
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteDevice('mixer', item)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(sortedMixers).map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">
                      {item.model}
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                    </span>
                    <div className="mobile-card-subtitle">Seri: {renderIssuedSerial(item)}</div>
                  </div>
                  <div>
                    <span className="badge badge-info">{item.status}</span>
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Loại máy:</span>
                    <span className="mobile-card-value">{item.type}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Tình trạng cấp phát:</span>
                    <span className="mobile-card-value">
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? `🟢 Gán [${info.setCode}] (${info.nppName})` : '⚪ Tự do trong kho';
                      })()}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDevice('mixer', item)}>
                    <Edit3 size={14} color="var(--accent-cyan)" />
                    <span>Sửa</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDevice('mixer', item)}>
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(sortedMixers.length)}
        </div>
      )}

      {/* VIEW 4: RAW COMPUTERS STOCK */}
      {activeSubTab === 'computers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '4px' }}>Danh Mục Máy Tính (Case & AIO)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '10px' }}>
              *Lưu ý: Mã quản lý được giữ nguyên khi chỉnh sửa. Ổn áp do NPP tự trang bị.
            </span>
            {renderDeviceFilterBar('Máy Tính', computers.length, true)}
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Loại Máy</th>
                  <th>Hệ Điều Hành</th>
                  <th>Cấu Hình (Chi Tiết)</th>
                  <th>Tình Trạng Kỹ Thuật</th>
                  <th>Kết Nối Mạng</th>
                  <th>Ổn Áp (NPP Trang Bị)</th>
                  <th>Tình Trạng Cấp Phát & NPP</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(sortedComputers).map(item => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: '700' }}>{item.id}</span>
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                    </td>
                    <td style={{ fontWeight: '700' }}>{item.type === 'Case' ? 'Case' : 'All In One'}</td>
                    <td>{item.os}</td>
                    <td style={{ fontSize: '0.825rem', color: 'var(--accent-cyan)', fontWeight: '600' }}>{item.specs}</td>
                    <td>
                      {item.status === 'Đã đổi trả máy mới' ? (
                        <span className="badge badge-warning" style={{ fontWeight: '700' }}>🔄 Đã đổi trả máy mới</span>
                      ) : (item.status === 'Đổi trả máy cũ' || item.status === 'Đã đổi trả máy cũ') ? (
                        <span className="badge badge-purple" style={{ fontWeight: '700' }}>🔁 Đổi trả máy cũ</span>
                      ) : item.status === 'Mới 100%' ? (
                        <span className="badge badge-success">{item.status}</span>
                      ) : (
                        <span className="badge badge-info">{item.status || 'Đang chạy tốt'}</span>
                      )}
                    </td>
                    <td>{item.network}</td>
                    <td>
                      {item.stabilizer?.hasStabilizer ? (
                        <span className="badge badge-success">✓ {item.stabilizer.brand}</span>
                      ) : (
                        <span className="badge badge-warning">⚠ Chưa có ổn áp</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? (
                          <div>
                            <span className="badge badge-success" style={{ fontWeight: '700' }}>🟢 {info.setCode}</span>
                            <div style={{ fontSize: '0.75rem', marginTop: '2px', color: 'var(--text-muted)' }}>
                              {info.nppName}
                            </div>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">⚪ Tự do trong kho</span>
                        );
                      })()}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenEditDevice('computer', item)}
                          title="Sửa Máy Tính"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Edit3 size={14} color="var(--accent-cyan)" />
                          <span>Sửa</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDeleteDevice('computer', item)}
                          title="Xóa Máy Tính"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' }}
                        >
                          <Trash2 size={14} color="var(--accent-red)" />
                          <span>Xóa</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(sortedComputers).map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">
                      {item.type === 'Case' ? 'Case' : 'All In One'}
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-purple)' }}>HĐH: {item.os}</div>
                  </div>
                  <div>
                    {item.status === 'Đã đổi trả máy mới' ? (
                      <span className="badge badge-warning">🔄 Đổi trả mới</span>
                    ) : (item.status === 'Đổi trả máy cũ' || item.status === 'Đã đổi trả máy cũ') ? (
                      <span className="badge badge-purple">🔁 Đổi trả cũ</span>
                    ) : (
                      <span className="badge badge-purple">{item.status || item.os}</span>
                    )}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Cấu hình:</span>
                    <span className="mobile-card-value" style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>{item.specs}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Tình trạng cấp phát:</span>
                    <span className="mobile-card-value">
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? `🟢 Gán [${info.setCode}] (${info.nppName})` : '⚪ Tự do trong kho';
                      })()}
                    </span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mạng:</span>
                    <span className="mobile-card-value">{item.network}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Ổn áp (NPP):</span>
                    <span className="mobile-card-value">
                      {item.stabilizer?.hasStabilizer ? <span className="badge badge-success">✓ {item.stabilizer.brand}</span> : <span className="badge badge-warning">⚠ Chưa có ổn áp</span>}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDevice('computer', item)}>
                    <Edit3 size={14} color="var(--accent-cyan)" />
                    <span>Sửa</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDevice('computer', item)}>
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(sortedComputers.length)}
        </div>
      )}

      {/* VIEW 5: RAW PRINTERS STOCK */}
      {activeSubTab === 'printers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '10px' }}>Danh Mục Máy In (Model Chuẩn: QL700)</h3>
            {renderDeviceFilterBar('Máy In', printers.length, false)}
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Model Máy In</th>
                  <th>Số Seri</th>
                  <th>Cổng Kết Nối</th>
                  <th>Tình Trạng</th>
                  <th>Tình Trạng Cấp Phát & NPP</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(sortedPrinters).map(item => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: '700' }}>{item.id}</span>
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                    </td>
                    <td style={{ fontWeight: '700' }}>{item.model}</td>
                    <td>{renderIssuedSerial(item)}</td>
                    <td>{item.connection}</td>
                    <td><span className="badge badge-info">{item.status}</span></td>
                    <td>
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? (
                          <div>
                            <span className="badge badge-success">🟢 Đã gán bộ</span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--accent-cyan)', marginTop: '2px' }}>{info.setCode}</div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>🏢 {info.nppName}</div>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">⚪ Tự do trong kho</span>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditDevice('printer', item)}>
                          <Edit3 size={14} color="var(--accent-cyan)" />
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteDevice('printer', item)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(sortedPrinters).map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">
                      {item.model}
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                    </span>
                    <div className="mobile-card-subtitle">Seri: {renderIssuedSerial(item)}</div>
                  </div>
                  <div>
                    <span className="badge badge-info">{item.status}</span>
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Kết nối:</span>
                    <span className="mobile-card-value">{item.connection}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Tình trạng cấp phát:</span>
                    <span className="mobile-card-value">
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? `🟢 Gán [${info.setCode}] (${info.nppName})` : '⚪ Tự do trong kho';
                      })()}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDevice('printer', item)}>
                    <Edit3 size={14} color="var(--accent-cyan)" />
                    <span>Sửa</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDevice('printer', item)}>
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(sortedPrinters.length)}
        </div>
      )}

      <div ref={infiniteSentinelRef} className="asset-infinite-sentinel" aria-hidden="true" />
      {hasNextPage && <div className="asset-load-more-fallback"><button type="button" className="btn btn-secondary" onClick={loadNextPage}>Tải thêm thiết bị</button></div>}
      </>);}
