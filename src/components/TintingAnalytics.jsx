import React, { useState } from 'react';
import { 
  BarChart3, 
  Flame, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  TrendingUp, 
  Award, 
  Droplet,
  Upload,
  FileText,
  RefreshCw,
  Play
} from 'lucide-react';

export default function TintingAnalytics({ tintingLogs, npps, onSyncLogs }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [nppFilter, setNppFilter] = useState('ALL');
  
  // IoT Simulation States
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | success | error
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [logDetails, setLogDetails] = useState('');

  const filteredLogs = tintingLogs.filter(log => {
    const matchesSearch = log.colorCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.nppName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.dispenserSerial.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesNpp = nppFilter === 'ALL' || log.nppId === nppFilter;
    return matchesSearch && matchesNpp;
  });

  // Calculate stats
  const totalLiters = tintingLogs.reduce((sum, log) => sum + (log.totalVolumeLiters || 0), 0);
  const totalPigment = tintingLogs.reduce((sum, log) => sum + (log.pigmentUsedMl || 0), 0);

  // Top NPPs Leaderboard
  const nppVolumeMap = tintingLogs.reduce((acc, curr) => {
    acc[curr.nppName] = (acc[curr.nppName] || 0) + curr.totalVolumeLiters;
    return acc;
  }, {});

  const leaderboard = Object.keys(nppVolumeMap).map(nppName => ({
    nppName,
    volume: nppVolumeMap[nppName]
  })).sort((a, b) => b.volume - a.volume);

  // ── IoT Simulated CSV File Generator & Parser ──────────────────────────────
  const generateAndDownloadSampleCSV = () => {
    const csvContent = 
`Timestamp,NppId,NppName,DispenserSerial,ColorCode,ProductLine,Base,ContainerSize,Quantity,TotalVolumeLiters,PigmentUsedMl
${new Date().toISOString().replace('T', ' ').substr(0, 19)},NPP-001,Công Ty TNHH Vật Liệu Hải Phòng,DISP-88291,NASUN-GOLD-99,Sơn phủ bóng cao cấp Gold,Base A,5L,2,10,150.2
${new Date().toISOString().replace('T', ' ').substr(0, 19)},NPP-002,Đại Lý Sơn Nasun Hà Nội,DISP-99212,NASUN-EASY-02,Sơn nội thất mịn màng Easy,Base B,18L,1,18,340.5
${new Date().toISOString().replace('T', ' ').substr(0, 19)},NPP-003,Nhà Phân Phối Nasun Miền Trung,DISP-66291,NASUN-SHIELD-04,Sơn ngoại thất chống thấm Shield,Base C,5L,3,15,220.0
`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "nasun_tinting_machine_iot_log.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      processLogsText(event.target.result);
    };
    reader.readAsText(file);
  };

  const processLogsText = (text) => {
    setSyncStatus('syncing');
    setSyncProgress(0);
    setErrorMessage('');

    // Parse lines
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      setSyncStatus('error');
      setLogDetails('Tệp CSV trống hoặc không đúng cấu trúc dòng.');
      return;
    }

    const headers = lines[0].split(',');
    const parsedLogs = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < headers.length) continue;
      
      parsedLogs.push({
        id: `L-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: cols[0],
        nppId: cols[1],
        nppName: cols[2],
        dispenserSerial: cols[3],
        colorCode: cols[4],
        productLine: cols[5],
        base: cols[6],
        containerSize: cols[7],
        quantity: parseInt(cols[8]) || 1,
        totalVolumeLiters: parseFloat(cols[9]) || 0,
        pigmentUsedMl: parseFloat(cols[10]) || 0,
        status: 'HOÀN THÀNH'
      });
    }

    if (parsedLogs.length === 0) {
      setSyncStatus('error');
      setLogDetails('Không tìm thấy dòng nhật ký hợp lệ nào trong tệp.');
      return;
    }

    // Simulate progress animation
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 10;
      setSyncProgress(currentProgress);
      if (currentProgress >= 100) {
        clearInterval(interval);
        setSyncStatus('success');
        setSyncedCount(parsedLogs.length);
        setLogDetails(`Đã đồng bộ thành công ${parsedLogs.length} dòng nhật ký pha màu từ tệp tin.`);
        
        // Callback to App.jsx to append the logs
        if (onSyncLogs) {
          onSyncLogs(prev => [...parsedLogs, ...prev]);
        }
      }
    }, 150);
  };

  const handleSimulateFastSync = () => {
    // Generate quick mock logs text and process immediately
    const mockCsv = 
`Timestamp,NppId,NppName,DispenserSerial,ColorCode,ProductLine,Base,ContainerSize,Quantity,TotalVolumeLiters,PigmentUsedMl
${new Date().toISOString().replace('T', ' ').substr(0, 19)},NPP-001,Công Ty TNHH Vật Liệu Hải Phòng,DISP-88291,NASUN-EXPERT-${Math.floor(Math.random() * 100)},Sơn bóng Expert,Base A,5L,1,5,98.5
${new Date().toISOString().replace('T', ' ').substr(0, 19)},NPP-002,Đại Lý Sơn Nasun Hà Nội,DISP-99212,NASUN-PRO-${Math.floor(Math.random() * 100)},Sơn mịn Pro,Base B,18L,2,36,650.0
`;
    processLogsText(mockCsv);
  };

  const [errorMessage, setErrorMessage] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Overview Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        
        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Tổng Sơn Đã Pha</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--accent-cyan)', marginTop: '4px' }}>
            {totalLiters} <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>Lít</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', marginTop: '4px' }}>▲ Năng suất pha màu tăng trưởng</div>
        </div>

        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Tổng Tinh Màu Chiết</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--accent-purple)', marginTop: '4px' }}>
            {totalPigment.toFixed(1)} <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>ml</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Đồng bộ tự động từ máy chiết</div>
        </div>

        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>NPP Hoạt Động Top 1</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fbbf24', marginTop: '4px' }}>
            🏆 {leaderboard[0]?.nppName || 'N/A'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Sản lượng: {leaderboard[0]?.volume || 0} Lít sơn</div>
        </div>

      </div>

      {/* IoT Synchronizer Section */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <RefreshCw size={20} color="var(--accent-cyan)" />
          <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0 }}>Đồng Bộ Nhật Ký Pha Màu Từ Thiết Bị (Giám Sát IoT Từ Xa)</h3>
        </div>
        
        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
          Để hỗ trợ theo dõi 200+ Nhà phân phối, KTV hoặc Đại lý có thể kết nối cổng USB máy chiết hoặc tải tệp tin log nhật ký (.csv) được kết xuất hàng ngày từ máy tính quản lý máy pha màu (ColorExpert/CorobTINT). Hệ thống sẽ tự động đồng bộ khối lượng pha lên cơ sở dữ liệu Nasun.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flexWrap: 'wrap' }}>
          
          {/* Uploader Box */}
          <div style={{
            border: '2px dashed rgba(6, 182, 212, 0.2)',
            borderRadius: '12px',
            padding: '24px 20px',
            background: 'rgba(6, 182, 212, 0.02)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '12px'
          }}>
            <Upload size={32} color="var(--accent-cyan)" />
            <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>Tải tệp tin nhật ký máy pha màu</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Chấp nhận định dạng .csv hoặc .txt</div>
            
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={14} />
              Chọn Tệp
              <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button 
                onClick={generateAndDownloadSampleCSV} 
                className="btn btn-link btn-xs"
                style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'underline' }}
              >
                Tải tệp mẫu (.csv)
              </button>
            </div>
          </div>

          {/* Sync Status / Simulator Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'center' }}>
            
            {/* Quick Simulate Trigger */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>Kiểm thử nhanh đồng bộ IoT:</div>
              <button 
                onClick={handleSimulateFastSync}
                disabled={syncStatus === 'syncing'}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: 'fit-content' }}
              >
                <Play size={14} fill="currentColor" />
                Giả Lập Đồng Bộ Tự Động Từ Xa
              </button>
            </div>

            {/* Sync Progress Indicator */}
            {syncStatus !== 'idle' && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ fontWeight: '700', color: syncStatus === 'success' ? 'var(--accent-emerald)' : 'var(--text-main)' }}>
                    {syncStatus === 'syncing' && '⏳ Đang truyền dữ liệu...'}
                    {syncStatus === 'success' && '✓ Đồng bộ thành công'}
                    {syncStatus === 'error' && '✕ Đồng bộ thất bại'}
                  </span>
                  {syncStatus === 'syncing' && <span>{syncProgress}%</span>}
                </div>

                {syncStatus === 'syncing' && (
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${syncProgress}%`, height: '100%', background: 'var(--accent-cyan)', transition: 'width 0.15s ease' }}></div>
                  </div>
                )}

                {logDetails && (
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {logDetails}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inactivity Clogging Warning Banner */}
      <div style={{
        padding: '14px 20px',
        background: 'rgba(244, 63, 94, 0.1)',
        border: '1px solid var(--accent-rose)',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <AlertTriangle size={20} color="#fb7185" />
        <div style={{ fontSize: '0.825rem', color: '#fb7185' }}>
          <strong>CẢNH BÁO NGHẸT ĐẦU PHUN:</strong> Máy chiết tại <strong>Công Ty TNHH Vật Liệu Hải Phòng</strong> không có giao dịch pha màu nào trong hơn 15 ngày. Khuyên nhắc NPP súc rửa ống tinh màu định kỳ!
        </div>
      </div>

      {/* Main Tinting Log Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '800' }}>Nhật Ký Giao Dịch Pha Màu Thực Tế Tại Các NPP</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Tìm mã màu, Seri máy..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', height: '34px', fontSize: '0.8rem', width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Desktop View Table */}
        <div className="desktop-only data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Lượt Pha</th>
                <th>Thời Gian</th>
                <th>Nhà Phân Phối</th>
                <th>Máy Chiết (Seri)</th>
                <th>Mã Màu (Color Code)</th>
                <th>Dòng Sơn & Gốc Base</th>
                <th>Quy Cách</th>
                <th>Tổng Lít</th>
                <th>Tinh Màu (ml)</th>
                <th>Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: 'var(--accent-cyan)' }}>{log.id}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.timestamp}</td>
                  <td style={{ fontWeight: '600' }}>{log.nppName}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{log.dispenserSerial}</td>
                  <td style={{ fontWeight: '700', color: '#fbbf24' }}>{log.colorCode}</td>
                  <td>
                    <div>{log.productLine}</div>
                    <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>{log.base}</span>
                  </td>
                  <td>{log.containerSize} x {log.quantity}</td>
                  <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{log.totalVolumeLiters} L</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{log.pigmentUsedMl} ml</td>
                  <td>
                    {log.status === 'HOÀN THÀNH' ? (
                      <span className="badge badge-success">✓ Hoàn Thành</span>
                    ) : (
                      <span className="badge badge-danger">✕ Hủy Bỏ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="mobile-only mobile-card-list">
          {filteredLogs.map(log => (
            <div className="mobile-card" key={log.id}>
              <div className="mobile-card-header">
                <div>
                  <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{log.id}</span>
                  <div className="mobile-card-subtitle">{log.timestamp}</div>
                </div>
                <div>
                  {log.status === 'HOÀN THÀNH' ? (
                    <span className="badge badge-success">✓ Thành Công</span>
                  ) : (
                    <span className="badge badge-danger">✕ Hủy</span>
                  )}
                </div>
              </div>
              <div className="mobile-card-body">
                <div className="mobile-card-row">
                  <span className="mobile-card-label">NPP:</span>
                  <span className="mobile-card-value">{log.nppName}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Seri Máy Chiết:</span>
                  <span className="mobile-card-value" style={{ fontFamily: 'var(--font-mono)' }}>{log.dispenserSerial}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Mã Màu:</span>
                  <span className="mobile-card-value" style={{ fontWeight: '700', color: '#fbbf24' }}>{log.colorCode}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Dòng Sơn:</span>
                  <span className="mobile-card-value">{log.productLine} ({log.base})</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Quy cách:</span>
                  <span className="mobile-card-value">{log.containerSize} x {log.quantity}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Tổng Lít:</span>
                  <span className="mobile-card-value" style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{log.totalVolumeLiters} L</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Tinh Màu:</span>
                  <span className="mobile-card-value">{log.pigmentUsedMl} ml</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
