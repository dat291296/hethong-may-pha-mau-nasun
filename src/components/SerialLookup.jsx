import React, { useState } from 'react';
import { Search, ShieldCheck, History, ArrowRight, CheckCircle2, Cpu, Building2 } from 'lucide-react';

export default function SerialLookup({ dispensers, mixers, computers, printers, systemSets, auditLogs }) {
  const [searchSerial, setSearchSerial] = useState('ST-A2-99801');
  const [searchedResult, setSearchedResult] = useState(null);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchSerial.trim()) return;

    const query = searchSerial.trim().toUpperCase();

    // Check dispensers
    let dev = dispensers.find(d => d.serial.toUpperCase().includes(query));
    let devType = 'Máy Chiết';
    if (!dev) {
      dev = mixers.find(m => m.serial.toUpperCase().includes(query));
      devType = 'Máy Lắc';
    }
    if (!dev) {
      dev = computers.find(c => c.serial.toUpperCase().includes(query));
      devType = 'Máy Tính';
    }
    if (!dev) {
      dev = printers.find(p => p.serial.toUpperCase().includes(query));
      devType = 'Máy In QL700';
    }

    if (dev) {
      const set = systemSets.find(s => s.setCode === dev.setCode);
      const history = auditLogs.filter(a => a.serialList?.toUpperCase().includes(query) || a.setCode === dev.setCode);

      setSearchedResult({
        device: dev,
        deviceType: devType,
        set,
        history
      });
    } else {
      setSearchedResult({ notFound: true, query });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Search Input Box */}
      <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(15,23,42,1) 100%)' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '8px' }}>
          Tra Cứu Lịch Sử & Vòng Đời Thiết Bị Theo Số Seri
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Nhập số Seri của Máy Chiết (Satint/Hero/Corob), Máy Lắc, Máy Tính hoặc Máy In QL700 để xem toàn bộ hành trình tác nghiệp.
        </p>

        <form onSubmit={handleSearch} style={{ display: 'flex', justifyContent: 'center', gap: '12px', maxWidth: '560px', margin: '0 auto' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Nhập số Seri (Ví dụ: ST-A2-99801, HERO-EU-5541...)"
              value={searchSerial}
              onChange={e => setSearchSerial(e.target.value)}
              style={{ paddingLeft: '40px', height: '44px', fontSize: '0.95rem' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ height: '44px', padding: '0 24px' }}>
            Tra Cứu Seri
          </button>
        </form>
      </div>

      {/* Result Display */}
      {searchedResult && !searchedResult.notFound && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <div>
              <span className="badge badge-info">{searchedResult.deviceType}</span>
              <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '6px', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                SERI: {searchedResult.device.serial}
              </h3>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Model Thiết Bị:</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>{searchedResult.device.model || searchedResult.device.type}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Tình Trạng Thiết Bị Hiện Tại:</div>
              <div style={{ fontWeight: '700', fontSize: '1rem' }}>{searchedResult.device.status}</div>
            </div>

            <div style={{ padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Bộ Máy & NPP Đang Gán:</div>
              {searchedResult.set ? (
                <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--accent-emerald)' }}>
                  [{searchedResult.set.setCode}] tại {searchedResult.set.nppName || 'Kho Tổng'}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>Chưa gán bộ máy nào (Trong kho)</div>
              )}
            </div>
          </div>

          <h4 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={18} color="var(--accent-cyan)" />
            <span>Lịch Sử Hành Trình Tác Nghiệp Của Seri Này ({searchedResult.history.length} Sự Kiện):</span>
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {searchedResult.history.map((log, index) => (
              <div key={log.id || index} style={{ padding: '14px 18px', background: 'var(--bg-main)', borderLeft: '4px solid var(--accent-cyan)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="badge badge-purple">{log.type}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.timestamp}</span>
                </div>
                <div style={{ fontWeight: '700', fontSize: '0.9rem', marginBottom: '4px' }}>
                  NPP Liên Quan: {log.nppName}
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>Lý do: {log.reason}</div>
                {log.notes && <div style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '4px', color: 'var(--text-main)' }}>*Ghi chú: {log.notes}</div>}
              </div>
            ))}
          </div>

        </div>
      )}

      {searchedResult && searchedResult.notFound && (
        <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Không tìm thấy thiết bị nào khớp với số Seri "{searchedResult.query}". Vui lòng kiểm tra lại.
        </div>
      )}

    </div>
  );
}
