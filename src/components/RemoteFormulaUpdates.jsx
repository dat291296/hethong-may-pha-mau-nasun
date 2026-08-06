import React, { useState } from 'react';
import { 
  RefreshCw, 
  Download, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Cpu, 
  HardDrive, 
  Wifi, 
  WifiOff, 
  Terminal, 
  FileCode2, 
  RotateCcw,
  PlayCircle,
  Laptop,
  Folder,
  Settings,
  Database
} from 'lucide-react';

export default function RemoteFormulaUpdates({ 
  formulaVersions, 
  systemSets, 
  onTriggerRemotePush,
  onSyncLogs
}) {
  const [activeSoftwareTab, setActiveSoftwareTab] = useState('ALL'); // ALL | ColorExpert 2 | ColorExpert 3 | CorobTINT
  const [showAgentDownloadModal, setShowAgentDownloadModal] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(formulaVersions[0] || null);
  const [extractingSetCodes, setExtractingSetCodes] = useState({});

  // Software Paths Customization State
  const [softwarePaths, setSoftwarePaths] = useState({
    'ColorExpert 2': {
      installDir: 'C:\\Program Files (x86)\\ColorExpert2',
      formulaDir: 'C:\\Program Files (x86)\\ColorExpert2\\Formula',
      historyDbFile: 'C:\\Program Files (x86)\\ColorExpert2\\DB\\TintHistory.mdb',
      fileFormat: '.MDB'
    },
    'ColorExpert 3': {
      installDir: 'C:\\ColorExpert3',
      formulaDir: 'C:\\ColorExpert3\\Data\\Formulas',
      historyDbFile: 'C:\\ColorExpert3\\Data\\History.db',
      fileFormat: '.DB (SQLite)'
    },
    'CorobTINT': {
      installDir: 'C:\\CorobTINT',
      formulaDir: 'C:\\CorobTINT\\FormulaDB',
      historyDbFile: 'C:\\CorobTINT\\Log\\DispenseHistory.xml',
      fileFormat: '.XML / .DAT'
    }
  });

  // Selected SW config in Modal
  const [modalSelectedSw, setModalSelectedSw] = useState('ColorExpert 3');

  // Live Console logs simulation
  const [consoleLogs, setConsoleLogs] = useState([
    { id: 1, time: '13:05:01', type: 'INFO', text: '[AGENT-NPP-HN-001] Trích xuất 4 đơn pha màu từ ColorExpert 3 (C:\\ColorExpert3\\Data\\History.db) -> Đẩy về Cloud thành công.' },
    { id: 2, time: '13:07:15', type: 'SUCCESS', text: '[REMOTE-PUSH] NPP Sơn Minh Phát: Ghi đè tệp công thức tại C:\\ColorExpert3\\Data\\Formulas\\Formula_CE3_v2026.2.db thành công.' },
    { id: 3, time: '13:08:30', type: 'WARNING', text: '[BACKUP-ENGINE] Tạo bản sao lưu khôi phục: C:\\ColorExpert3\\Data\\Formulas\\backup_20260726_Formula_CE3.bak' },
    { id: 4, time: '13:10:05', type: 'SUCCESS', text: '[AGENT-COROB] Tự động trích xuất XML log tại C:\\CorobTINT\\Log\\DispenseHistory.xml -> Cập nhật sản lượng 18L sơn.' }
  ]);

  // Simulation push state
  const [pushing, setPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState(0);

  const handlePushNow = (version, targetSw) => {
    setPushing(true);
    setPushProgress(10);

    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleTimeString('vi-VN'),
      type: 'INFO',
      text: `[PUSH-COMMAND] Khởi tạo lệnh đẩy phiên bản ${version.versionId} tới nhóm phần mềm ${targetSw}...`
    };
    setConsoleLogs(prev => [newLog, ...prev]);

    const interval = setInterval(() => {
      setPushProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setPushing(false);
          onTriggerRemotePush({ versionId: version.versionId, targetSw });

          const successLog = {
            id: Date.now() + 1,
            time: new Date().toLocaleTimeString('vi-VN'),
            type: 'SUCCESS',
            text: `[PUSH-COMPLETE] Đã đẩy thành công và ghi đè Database công thức ${version.versionId} cho các NPP đang Online! 🟢`
          };
          setConsoleLogs(prev => [successLog, ...prev]);
          return 100;
        }
        return prev + 30;
      });
    }, 400);
  };

  const handleRollback = (set) => {
    if (confirm(`Bạn có chắc muốn KHÔI PHỤC BẢN CÔNG THỨC CŨ (Rollback) cho máy tính NPP ${set.nppName}?`)) {
      const rollbackLog = {
        id: Date.now(),
        time: new Date().toLocaleTimeString('vi-VN'),
        type: 'WARNING',
        text: `[ROLLBACK-EXECUTED] Máy tính NPP ${set.nppName} (${set.setCode}) đã tự động khôi phục lại dữ liệu công thức trước đó từ file Backup.`
      };
      setConsoleLogs(prev => [rollbackLog, ...prev]);
      alert(`Đã gửi lệnh Rollback thành công tới máy tính NPP ${set.nppName}!`);
    }
  };

  const handleExtractLogs = (set) => {
    if (set.agentStatus !== 'Online') {
      alert(`Thiết bị của NPP ${set.nppName} đang Offline. Không thể kết nối với Agent để trích xuất dữ liệu!`);
      return;
    }

    const setCode = set.setCode;
    setExtractingSetCodes(prev => ({ ...prev, [setCode]: true }));

    const startLog = {
      id: Date.now(),
      time: new Date().toLocaleTimeString('vi-VN'),
      type: 'INFO',
      text: `[AGENT-EXTRACT] Bắt đầu kết nối với Agent tại NPP ${set.nppName} (${setCode})...`
    };
    setConsoleLogs(prev => [startLog, ...prev]);

    setTimeout(() => {
      const pathInfo = softwarePaths[set.tintingSoftware] || {};
      const readLog = {
        id: Date.now() + 1,
        time: new Date().toLocaleTimeString('vi-VN'),
        type: 'INFO',
        text: `[AGENT-EXTRACT] Đang đọc tệp nhật ký: ${pathInfo.historyDbFile}...`
      };
      setConsoleLogs(prev => [readLog, ...prev]);

      setTimeout(() => {
        const randomVol = [5, 18][Math.floor(Math.random() * 2)];
        const randomQty = Math.floor(Math.random() * 3) + 1;
        const colorName = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE'][Math.floor(Math.random() * 5)];
        const randomCode = Math.floor(Math.random() * 800) + 100;
        
        const newRecord = {
          id: `L-EXT-${Date.now()}-${Math.floor(Math.random() * 100)}`,
          timestamp: new Date().toISOString().replace('T', ' ').substr(0, 19),
          nppId: set.nppId || 'NPP-001',
          nppName: set.nppName,
          dispenserSerial: set.dispenserSerial || 'DISP-88291',
          colorCode: `NASUN-${colorName}-${randomCode}`,
          productLine: 'Sơn nội thất cao cấp Nasun Lux',
          base: ['Base A', 'Base B', 'Base C'][Math.floor(Math.random() * 3)],
          containerSize: `${randomVol}L`,
          quantity: randomQty,
          totalVolumeLiters: randomVol * randomQty,
          pigmentUsedMl: parseFloat((randomVol * randomQty * 12.8).toFixed(1)),
          status: 'HOÀN THÀNH'
        };

        if (onSyncLogs) {
          onSyncLogs(prev => [newRecord, ...prev]);
        }

        const successLog = {
          id: Date.now() + 2,
          time: new Date().toLocaleTimeString('vi-VN'),
          type: 'SUCCESS',
          text: `[AGENT-SUCCESS] Trích xuất thành công ${randomQty} lượt pha (${randomVol * randomQty}L) từ máy chiết ${set.dispenserSerial || 'DISP-88291'}!`
        };
        setConsoleLogs(prev => [successLog, ...prev]);
        setExtractingSetCodes(prev => ({ ...prev, [setCode]: false }));
        
        alert(`Trích xuất & Đồng bộ thành công ${randomQty} lượt pha màu mới từ NPP ${set.nppName}!`);
      }, 1000);
    }, 800);
  };

  const filteredSets = systemSets.filter(s => {
    if (activeSoftwareTab === 'ALL') return true;
    return s.tintingSoftware === activeSoftwareTab;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Banner & Tool Download CTA */}
      <div className="glass-panel" style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(2,132,199,0.25) 0%, rgba(6,182,212,0.15) 100%)', border: '1px solid var(--accent-cyan)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)', color: '#fff', boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)' }}>
              <RefreshCw size={28} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)' }}>
                Hệ Thống Cập Nhật Công Thức Màu & Trích Xuất Dữ Liệu Pha Màu Tự Động
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Hỗ trợ trích xuất log & ghi đè thư mục công thức riêng cho 3 phần mềm: <strong>ColorExpert 2</strong>, <strong>ColorExpert 3</strong>, <strong>CorobTINT</strong>.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" onClick={() => setShowAgentDownloadModal(true)} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
              <Settings size={18} />
              <span>Cấu Hình Thư Mục & Tải Tool Agent Cho Máy NPP</span>
            </button>
          </div>
        </div>
      </div>

      {/* Software Tabs Filter */}
      <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '700', marginRight: '8px' }}>Lọc Theo Phần Mềm:</span>
          <button className={`btn ${activeSoftwareTab === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveSoftwareTab('ALL')}>
            Tất Cả (ColorExpert 2/3 & CorobTINT)
          </button>
          <button className={`btn ${activeSoftwareTab === 'ColorExpert 2' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveSoftwareTab('ColorExpert 2')}>
            ColorExpert 2 ({systemSets.filter(s => s.tintingSoftware === 'ColorExpert 2').length} NPP)
          </button>
          <button className={`btn ${activeSoftwareTab === 'ColorExpert 3' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveSoftwareTab('ColorExpert 3')}>
            ColorExpert 3 ({systemSets.filter(s => s.tintingSoftware === 'ColorExpert 3').length} NPP)
          </button>
          <button className={`btn ${activeSoftwareTab === 'CorobTINT' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveSoftwareTab('CorobTINT')}>
            CorobTINT ({systemSets.filter(s => s.tintingSoftware === 'CorobTINT').length} NPP)
          </button>
        </div>
      </div>

      {/* Push Progress Animation Bar */}
      {pushing && (
        <div className="glass-panel" style={{ padding: '16px', background: 'rgba(6, 182, 212, 0.15)', border: '1px solid var(--accent-cyan)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--accent-cyan)' }}>
              ⚡ Đang đẩy tệp công thức từ xa tới thư mục làm việc của các máy tính NPP đang Online... ({pushProgress}%)
            </span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${pushProgress}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7 0%, #06b6d4 100%)', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* Active Formula Version Card & File Formats */}
      {selectedVersion && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <div>
              <span className="badge badge-purple" style={{ fontFamily: 'var(--font-mono)' }}>{selectedVersion.versionId}</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginTop: '4px' }}>{selectedVersion.title}</h3>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Phát hành: {selectedVersion.releaseDate} • Tác giả: {selectedVersion.author}
            </div>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            📝 Ghi chú phiên bản: {selectedVersion.notes}
          </p>

          <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>Tệp Công Thức & Thư Mục Cài Đặt Ghi Đè Theo Phần Mềm:</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            
            {/* ColorExpert 2 File */}
            <div style={{ padding: '14px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                🔹 ColorExpert 2 (File .MDB)
              </div>
              <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{selectedVersion.files.colorExpert2.filename}</div>
              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                📁 Thư mục cài đè: <code>{softwarePaths['ColorExpert 2'].formulaDir}</code>
              </div>
            </div>

            {/* ColorExpert 3 File */}
            <div style={{ padding: '14px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--accent-purple)', marginBottom: '4px' }}>
                🟣 ColorExpert 3 (File .DB SQLite)
              </div>
              <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{selectedVersion.files.colorExpert3.filename}</div>
              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                📁 Thư mục cài đè: <code>{softwarePaths['ColorExpert 3'].formulaDir}</code>
              </div>
            </div>

            {/* CorobTINT File */}
            <div style={{ padding: '14px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.825rem', fontWeight: '700', color: '#34d399', marginBottom: '4px' }}>
                🟢 CorobTINT (File .XML Corob)
              </div>
              <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{selectedVersion.files.corobTint.filename}</div>
              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                📁 Thư mục cài đè: <code>{softwarePaths['CorobTINT'].formulaDir}</code>
              </div>
            </div>

          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn btn-primary" onClick={() => handlePushNow(selectedVersion, activeSoftwareTab)}>
              <RefreshCw size={16} />
              <span>Đẩy Cập Nhật Công Thức Ngay (Push Online)</span>
            </button>
            <button className="btn btn-secondary" onClick={() => alert('Đã đóng gói thành công file ZIP Offline phân theo thư mục 3 phần mềm cho USB!')}>
              <Download size={16} />
              <span>Xuất Gói Cập Nhật USB Offline</span>
            </button>
          </div>
        </div>
      )}

      {/* Sync Status Tracker Table per NPP Computer */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '14px' }}>
          Trạng Thái Kết Nối Agent, Thư Mục Cài Đặt & Trích Xuất Dữ Liệu ({filteredSets.length} NPP)
        </h3>

        <div className="desktop-only data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Bộ Máy</th>
                <th>Nhà Phân Phối</th>
                <th>Phần Mềm Pha</th>
                <th>Trạng Thái Agent</th>
                <th>Đường Dẫn Trích Xuất DB</th>
                <th>Đồng Bộ Công Thức</th>
                <th>Trích Xuất Log Pha</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredSets.map(set => {
                const isSynced = set.softwareVersion?.includes('v3.4') || set.softwareVersion?.includes('v1.15') || set.softwareVersion?.includes('v2.9');
                const pathInfo = softwarePaths[set.tintingSoftware] || {};
                return (
                  <tr key={set.id}>
                    <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{set.setCode}</td>
                    <td style={{ fontWeight: '600' }}>{set.nppName}</td>
                    <td>
                      <span className="badge badge-info">{set.tintingSoftware}</span>
                    </td>
                    <td>
                      {set.agentStatus === 'Online' ? (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Wifi size={12} /> Online
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <WifiOff size={12} /> Offline
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {pathInfo.historyDbFile}
                      </div>
                    </td>
                    <td>
                      {isSynced ? (
                        <span className="badge badge-success">✓ ĐÃ ĐỒNG BỘ</span>
                      ) : (
                        <span className="badge badge-warning">⏳ CHỜ CẬP NHẬT</span>
                      )}
                    </td>
                    <td>
                      {set.agentStatus === 'Online' ? (
                        <button
                          disabled={extractingSetCodes[set.setCode]}
                          onClick={() => handleExtractLogs(set)}
                          className="btn btn-secondary btn-xs"
                          style={{
                            borderColor: 'var(--accent-purple)',
                            color: 'var(--accent-purple)',
                            fontSize: '0.7rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            background: extractingSetCodes[set.setCode] ? 'rgba(147,51,234,0.1)' : 'transparent'
                          }}
                        >
                          <RefreshCw size={10} className={extractingSetCodes[set.setCode] ? 'spin' : ''} style={{ flexShrink: 0 }} />
                          {extractingSetCodes[set.setCode] ? 'Đang trích xuất...' : '⚡ Trích Xuất Ngay'}
                        </button>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>✕ Offline</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handlePushNow(selectedVersion, set.tintingSoftware)}>
                          Đẩy Công Thức
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleRollback(set)}>
                          <RotateCcw size={12} /> Rollback
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
          {filteredSets.map(set => {
            const isSynced = set.softwareVersion?.includes('v3.4') || set.softwareVersion?.includes('v1.15') || set.softwareVersion?.includes('v2.9');
            const pathInfo = softwarePaths[set.tintingSoftware] || {};
            return (
              <div className="mobile-card" key={set.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{set.setCode}</span>
                    <div className="mobile-card-subtitle">{set.nppName}</div>
                  </div>
                  <div>
                    {set.agentStatus === 'Online' ? (
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem' }}>
                        <Wifi size={10} /> Online
                      </span>
                    ) : (
                      <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem' }}>
                        <WifiOff size={10} /> Offline
                      </span>
                    )}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Phần mềm:</span>
                    <span className="mobile-card-value">{set.tintingSoftware}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Cập nhật:</span>
                    <span className="mobile-card-value">
                      {isSynced ? (
                        <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✓ ĐÃ ĐỒNG BỘ</span>
                      ) : (
                        <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>⏳ CHỜ CẬP NHẬT</span>
                      )}
                    </span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Log Pha:</span>
                    <span className="mobile-card-value">
                      {set.agentStatus === 'Online' ? (
                        <button
                          disabled={extractingSetCodes[set.setCode]}
                          onClick={() => handleExtractLogs(set)}
                          className="btn btn-secondary btn-xs"
                          style={{
                            borderColor: 'var(--accent-purple)',
                            color: 'var(--accent-purple)',
                            fontSize: '0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            background: extractingSetCodes[set.setCode] ? 'rgba(147,51,234,0.1)' : 'transparent'
                          }}
                        >
                          <RefreshCw size={10} className={extractingSetCodes[set.setCode] ? 'spin' : ''} style={{ flexShrink: 0 }} />
                          {extractingSetCodes[set.setCode] ? 'Trích xuất...' : '⚡ Trích Xuất'}
                        </button>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>✕ Offline</span>
                      )}
                    </span>
                  </div>
                  <div className="mobile-card-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                    <span className="mobile-card-label">Thư mục DB:</span>
                    <span className="mobile-card-value" style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', textAlign: 'left', wordBreak: 'break-all' }}>
                      {pathInfo.historyDbFile}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handlePushNow(selectedVersion, set.tintingSoftware)}>
                    Đẩy Công Thức
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRollback(set)}>
                    <RotateCcw size={12} /> Rollback
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Console Command Logs */}
      <div className="glass-panel" style={{ padding: '20px', background: '#090d16', border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--accent-cyan)' }}>
          <Terminal size={18} />
          <h4 style={{ fontSize: '0.95rem', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>Live Remote Console Monitor (Realtime Logs)</h4>
        </div>
        <div style={{
          background: '#020617',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '12px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          maxHeight: '180px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          {consoleLogs.map(log => (
            <div key={log.id} style={{
              color: log.type === 'SUCCESS' ? '#34d399' : log.type === 'WARNING' ? '#fbbf24' : '#38bdf8'
            }}>
              <span style={{ color: '#64748b' }}>[{log.time}]</span> {log.text}
            </div>
          ))}
        </div>
      </div>

      {/* Agent Download & Directory Setup Instructions Modal */}
      {showAgentDownloadModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={22} color="var(--accent-cyan)" />
                <h3 style={{ fontWeight: '800' }}>Cấu Hình Thư Mục Phần Mềm & Tải Tool Agent Cho Máy NPP</h3>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAgentDownloadModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              
              {/* Software Path Picker Selector */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontWeight: '700', marginBottom: '8px' }}>1. Thiết Lập Đường Dẫn Thư Mục Cài Đặt Cho Từng Phần Mềm:</h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  {['ColorExpert 2', 'ColorExpert 3', 'CorobTINT'].map(sw => (
                    <button
                      key={sw}
                      type="button"
                      className={`btn ${modalSelectedSw === sw ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      onClick={() => setModalSelectedSw(sw)}
                    >
                      {sw}
                    </button>
                  ))}
                </div>

                {/* Form to edit paths for selected software */}
                <div style={{ padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Thư Mục Ghi Đè Tệp Công Thức Màu ({modalSelectedSw})</label>
                    <input
                      type="text"
                      className="form-input"
                      value={softwarePaths[modalSelectedSw]?.formulaDir || ''}
                      onChange={e => setSoftwarePaths({
                        ...softwarePaths,
                        [modalSelectedSw]: { ...softwarePaths[modalSelectedSw], formulaDir: e.target.value }
                      })}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Đường Dẫn Tệp Database/Log Trích Xuất Lịch Sử Pha Màu ({modalSelectedSw})</label>
                    <input
                      type="text"
                      className="form-input"
                      value={softwarePaths[modalSelectedSw]?.historyDbFile || ''}
                      onChange={e => setSoftwarePaths({
                        ...softwarePaths,
                        [modalSelectedSw]: { ...softwarePaths[modalSelectedSw], historyDbFile: e.target.value }
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Download CTA Box */}
              <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-emerald)', borderRadius: '8px', marginBottom: '20px' }}>
                <h4 style={{ fontWeight: '700', color: '#34d399', marginBottom: '4px' }}>
                  📦 Phần mềm `ColorMix_NPP_Agent_Setup.exe` (Phiên bản Windows Service)
                </h4>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-main)' }}>
                  Tool sẽ tự động chạy cùng Windows tại máy tính NPP, tự đọc file công thức màu mới ghi đè vào đúng thư mục cài đặt đã cấu hình và tự trích xuất dữ liệu pha màu gửi về hệ thống Cloud.
                </p>
                <div style={{ marginTop: '12px' }}>
                  <button className="btn btn-primary" onClick={() => alert('Đã tải thành công bộ cài đặt ColorMix_NPP_Agent_Setup.exe kèm file config.json tùy chỉnh thư mục!')}>
                    <Download size={16} />
                    <span>Tải File Cài Đặt (.EXE) Cho Máy NPP</span>
                  </button>
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAgentDownloadModal(false)}>Lưu & Đóng</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
