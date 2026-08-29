import React, { useState } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  FileText, 
  HardDrive,
  Copy,
  Check
} from 'lucide-react';
import { getOfflineQueue, syncOfflineQueue, clearOfflineQueue, cacheOfflineData } from '../lib/offlineSync.js';

/**
 * DataBackupSyncModal - Export/Import local device data & trigger cloud sync
 */
export default function DataBackupSyncModal({ 
  isOpen, 
  onClose,
  npps = [],
  dispensers = [],
  mixers = [],
  computers = [],
  printers = [],
  systemSets = [],
  repairTickets = [],
  auditLogs = [],
  tintingLogs = [],
  onImportData
}) {
  const [activeTab, setActiveTab] = useState('export'); // 'export' | 'import' | 'sync'
  const [importJsonText, setImportJsonText] = useState('');
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'success' | 'error'
  const [syncMsg, setSyncMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  // Check offline queue count on mount/tab change
  React.useEffect(() => {
    if (isOpen) {
      getOfflineQueue().then(q => setQueueCount(q.length));
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // Prepare full data package
  const buildDataPackage = () => {
    return {
      appName: 'Paint Tinting Manager',
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      summary: {
        nppsCount: npps.length,
        dispensersCount: dispensers.length,
        mixersCount: mixers.length,
        computersCount: computers.length,
        printersCount: printers.length,
        systemSetsCount: systemSets.length,
        repairTicketsCount: repairTickets.length,
        auditLogsCount: auditLogs.length,
        tintingLogsCount: tintingLogs.length,
      },
      data: {
        npps,
        dispensers,
        mixers,
        computers,
        printers,
        systemSets,
        repairTickets,
        auditLogs,
        tintingLogs
      }
    };
  };

  // Export JSON file download
  const handleExportFile = () => {
    const dataPkg = buildDataPackage();
    const jsonStr = JSON.stringify(dataPkg, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `nasun-tinting-data-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy JSON string to clipboard
  const handleCopyJson = () => {
    const dataPkg = buildDataPackage();
    const jsonStr = JSON.stringify(dataPkg);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // Process Import File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setImportJsonText(evt.target.result);
    };
    reader.readAsText(file);
  };

  // Perform Import & Merge Data
  const handleExecuteImport = () => {
    if (!importJsonText.trim()) {
      alert('Vui lòng chọn tệp JSON hoặc dán chuỗi dữ liệu sao lưu.');
      return;
    }

    try {
      const parsed = JSON.parse(importJsonText);
      const importedData = parsed.data || parsed;

      if (!importedData.npps && !importedData.dispensers && !importedData.systemSets) {
        alert('Cấu trúc tệp dữ liệu không hợp lệ. Vui lòng kiểm tra lại tệp sao lưu.');
        return;
      }

      if (onImportData) {
        onImportData(importedData);
      }

      alert('Đã nhập dữ liệu từ tệp sao lưu thành công!');
      setImportJsonText('');
      onClose();
    } catch (err) {
      alert(`Lỗi đọc tệp JSON: ${err.message}`);
    }
  };

  // Cloud Sync Handler
  const handleTriggerCloudSync = async () => {
    setSyncStatus('syncing');
    setSyncMsg('Đang gửi dữ liệu từ hàng chờ offline lên Supabase Cloud...');

    try {
      const success = await syncOfflineQueue((status, remaining, err) => {
        if (status === 'error') {
          setSyncMsg(`Lỗi đồng bộ: ${err}`);
        }
      });

      if (success) {
        setSyncStatus('success');
        setSyncMsg('Tất cả dữ liệu từ điện thoại đã được đồng bộ thành công lên Cloud!');
        setQueueCount(0);
      } else {
        setSyncStatus('error');
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncMsg(`Lỗi kết nối đồng bộ: ${err.message}`);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="modal-container" 
        style={{ maxWidth: '640px', width: '94%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="badge badge-purple" style={{ padding: '0.5rem', borderRadius: '50%' }}>
              <Database size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                Sao Lưu & Đồng Bộ Dữ Liệu Thiết Bị (Mobile ⇄ Web)
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Xuất/Nhập dữ liệu lưu trữ giữa điện thoại và tài khoản Admin trên Web
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.25rem' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', margin: '0.75rem 0' }}>
          <button
            className={`btn ${activeTab === 'export' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 0, borderBottom: activeTab === 'export' ? '2px solid var(--primary-color)' : 'none' }}
            onClick={() => setActiveTab('export')}
          >
            <Download size={16} style={{ marginRight: '0.4rem' }} />
            1. Xuất Dữ Liệu Điện Thoại
          </button>

          <button
            className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 0, borderBottom: activeTab === 'import' ? '2px solid var(--primary-color)' : 'none' }}
            onClick={() => setActiveTab('import')}
          >
            <Upload size={16} style={{ marginRight: '0.4rem' }} />
            2. Nạp Dữ Liệu Vào Web
          </button>

          <button
            className={`btn ${activeTab === 'sync' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 0, borderBottom: activeTab === 'sync' ? '2px solid var(--primary-color)' : 'none' }}
            onClick={() => setActiveTab('sync')}
          >
            <RefreshCw size={16} style={{ marginRight: '0.4rem' }} />
            3. Đồng Bộ Đám Mây ({queueCount})
          </button>
        </div>

        {/* Tab 1: EXPORT */}
        {activeTab === 'export' && (
          <div className="modal-body">
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              <HardDrive size={18} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem' }}>
                Xuất toàn bộ bản ghi hiện có trên điện thoại ra tệp JSON hoặc copy chuỗi dữ liệu để nạp vào tài khoản Admin trên Web máy tính.
              </span>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>📊 Thống kê dữ liệu hiện tại trên thiết bị:</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.825rem' }}>
                <div>• Nhà phân phối: <strong>{npps.length}</strong></div>
                <div>• Máy chiết: <strong>{dispensers.length}</strong></div>
                <div>• Máy lắc: <strong>{mixers.length}</strong></div>
                <div>• Máy tính: <strong>{computers.length}</strong></div>
                <div>• Máy in: <strong>{printers.length}</strong></div>
                <div>• Bộ hệ thống: <strong>{systemSets.length}</strong></div>
                <div>• Phiếu sửa chữa: <strong>{repairTickets.length}</strong></div>
                <div>• Nhật ký tác nghiệp: <strong>{auditLogs.length}</strong></div>
                <div>• Nhật ký pha màu: <strong>{tintingLogs.length}</strong></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleExportFile}
                style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
              >
                <Download size={18} />
                Tải Tệp Backup (.json)
              </button>

              <button 
                className="btn btn-secondary" 
                onClick={handleCopyJson}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {copied ? <Check size={18} style={{ color: '#10b981' }} /> : <Copy size={18} />}
                {copied ? 'Đã Sao Chép!' : 'Sao Chép JSON'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: IMPORT */}
        {activeTab === 'import' && (
          <div className="modal-body">
            <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem' }}>
                Nhập tệp dữ liệu sao lưu từ điện thoại vào Web Admin để hiển thị và đồng bộ toàn bộ danh sách.
              </span>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                📁 Tải tệp sao lưu (.json):
              </label>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleFileUpload} 
                className="form-control"
                style={{ fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Hoặc dán chuỗi JSON dữ liệu vào đây:
              </label>
              <textarea
                className="form-control"
                rows={5}
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder="Dán nội dung tệp .json vào đây..."
                style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
            </div>

            <button 
              className="btn btn-success" 
              onClick={handleExecuteImport}
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
            >
              <Upload size={18} />
              Bắt Đầu Nạp Dữ Liệu Vào Hệ Thống
            </button>
          </div>
        )}

        {/* Tab 3: SYNC */}
        {activeTab === 'sync' && (
          <div className="modal-body">
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              <RefreshCw size={18} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem' }}>
                Đẩy trực tiếp các thao tác tạo mới/chỉnh sửa ở hàng chờ offline ({queueCount} hành động) lên cơ sở dữ liệu Supabase Cloud.
              </span>
            </div>

            {syncMsg && (
              <div 
                className={`alert ${syncStatus === 'success' ? 'alert-success' : syncStatus === 'error' ? 'alert-danger' : 'alert-info'}`}
                style={{ marginBottom: '1rem' }}
              >
                {syncStatus === 'success' && <CheckCircle2 size={18} />}
                {syncStatus === 'error' && <AlertTriangle size={18} />}
                <span>{syncMsg}</span>
              </div>
            )}

            <button 
              className="btn btn-primary" 
              onClick={handleTriggerCloudSync}
              disabled={syncStatus === 'syncing'}
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.75rem' }}
            >
              <RefreshCw size={18} className={syncStatus === 'syncing' ? 'spin' : ''} />
              {syncStatus === 'syncing' ? 'Đang Đồng Bộ Đám Mây...' : 'Đồng Bộ Hàng Chờ Lên Supabase Cloud Ngay'}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '1rem', textAlign: 'right' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
