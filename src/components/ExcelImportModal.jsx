import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Eye,
  ChevronDown,
  Loader2
} from 'lucide-react';
import { sanitizeForSheet, sanitizeText, validatePhone, validateSerial, validateGps } from '../security/sanitize.js';


// ─────────────────────────────────────────────
// Column definitions for each import type
// ─────────────────────────────────────────────
const IMPORT_CONFIGS = {
  npp: {
    label: 'Nhà Phân Phối (NPP)',
    icon: '🏢',
    columns: [
      { key: 'name',                label: 'Tên Nhà Phân Phối',    required: true  },
      { key: 'phone',               label: 'Số Điện Thoại',         required: true  },
      { key: 'contactPerson',       label: 'Người Liên Hệ',         required: false },
      { key: 'region',              label: 'Khu Vực (Miền Bắc/Trung/Nam)', required: true  },
      { key: 'province',            label: 'Tỉnh / Thành Phố',      required: false },
      { key: 'address',             label: 'Địa Chỉ Chi Tiết',      required: false },
      { key: 'locationCoordinates', label: 'Tọa Độ GPS (vd: 21.00, 105.84)', required: false },
      { key: 'status',              label: 'Trạng Thái (Đang hợp tác / Đã ngưng)', required: false },
    ],
    sampleRows: [
      ['Nhà Phân Phối Sơn Minh Phát', '0912 345 678', 'Nguyễn Văn Phát', 'Miền Bắc', 'Hà Nội', 'Số 45 Đường Giải Phóng, Q. Hai Bà Trưng', '21.0024, 105.8412', 'Đang hợp tác'],
      ['Đại Lý Sơn Nam Phương', '0908 123 456', 'Trần Thị Lan', 'Miền Nam', 'TP. Hồ Chí Minh', '120 Đường Lê Văn Việt, Quận 9', '', 'Đang hợp tác'],
    ],
  },
  dispenser: {
    label: 'Máy Chiết (Tinting Machine)',
    icon: '🖨️',
    columns: [
      { key: 'model',  label: 'Hệ Máy / Model (Satint A2, Hero, Corob F1...)', required: true  },
      { key: 'serial', label: 'Số Seri (Serial Number – Duy nhất)',            required: true  },
      { key: 'status', label: 'Tình Trạng Kỹ Thuật (Mới 100% / Đang chạy tốt / Cần bảo trì / Hỏng đầu phun)', required: false },
    ],
    sampleRows: [
      ['Satint A2',      'ST-A2-20001', 'Mới 100%'],
      ['Hero Eurotint',  'HERO-20002',  'Đang chạy tốt'],
      ['Corob F1',       'COROB-20003', 'Mới 100%'],
    ],
  },
  mixer: {
    label: 'Máy Lắc (Mixer / Shaker)',
    icon: '🔄',
    columns: [
      { key: 'model',  label: 'Hệ Máy / Model (AI88, Evoshake-200, KMC-300...)', required: true  },
      { key: 'type',   label: 'Loại Lắc (Lắc xoay khép kín / Lắc rung đứng)', required: true  },
      { key: 'serial', label: 'Số Seri',       required: true  },
      { key: 'status', label: 'Tình Trạng Kỹ Thuật', required: false },
    ],
    sampleRows: [
      ['AI88',          'Lắc rung đứng',    'MIX-AI88-001', 'Mới 100%'],
      ['Evoshake-200',  'Lắc xoay khép kín','EVO-200-002',  'Đang chạy tốt'],
    ],
  },
  computer: {
    label: 'Máy Tính (Computer)',
    icon: '💻',
    columns: [
      { key: 'type',    label: 'Loại Máy (AIO / Case)',           required: true  },
      { key: 'os',      label: 'Hệ Điều Hành (Windows 10 / 11...)', required: true  },
      { key: 'specs',   label: 'Cấu Hình (CPU / RAM / SSD)',      required: false },
      { key: 'serial',  label: 'Số Seri',                         required: true  },
      { key: 'network', label: 'Kết Nối Mạng (Có mạng LAN / Wifi / Không có mạng)', required: false },
    ],
    sampleRows: [
      ['AIO',  'Windows 11 Pro',    'Core i5 / 16GB / 512GB SSD', 'PC-AIO-001', 'Có mạng LAN'],
      ['Case', 'Windows 10 LTSC',   'Core i3 / 8GB / 256GB SSD',  'PC-CASE-002','Có mạng Wifi'],
    ],
  },
  printer: {
    label: 'Máy In QL700 (Printer)',
    icon: '🖨️',
    columns: [
      { key: 'model',      label: 'Model Máy In (QL700)',          required: true  },
      { key: 'serial',     label: 'Số Seri',                       required: true  },
      { key: 'connection', label: 'Cổng Kết Nối (USB / LAN / Bluetooth)', required: false },
      { key: 'status',     label: 'Tình Trạng',                    required: false },
    ],
    sampleRows: [
      ['QL700', 'QL700-001', 'USB',       'Mới 100%'],
      ['QL700', 'QL700-002', 'Bluetooth', 'Đang chạy tốt'],
    ],
  },
};

// Region mapping shortcodes
const REGION_MAP = {
  'mb': 'Miền Bắc', 'mien bac': 'Miền Bắc', 'north': 'Miền Bắc',
  'mt': 'Miền Trung', 'mien trung': 'Miền Trung', 'central': 'Miền Trung',
  'mn': 'Miền Nam', 'mien nam': 'Miền Nam', 'south': 'Miền Nam',
};

function normalizeRegion(val = '') {
  const lower = val.trim().toLowerCase();
  return REGION_MAP[lower] || val.trim() || 'Miền Bắc';
}

// ─────────────────────────────────────────────
// Generate and download a sample Excel template
// ─────────────────────────────────────────────
function downloadTemplate(importType) {
  const config = IMPORT_CONFIGS[importType];
  const headers = config.columns.map(c => c.label);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...config.sampleRows]);

  // Style header row width
  ws['!cols'] = headers.map(() => ({ wch: 32 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `Mau_Import_${importType.toUpperCase()}.xlsx`);
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function ExcelImportModal({
  importType: defaultImportType = 'npp',
  existingNpps = [],
  existingDispensers = [],
  existingMixers = [],
  existingComputers = [],
  existingPrinters = [],
  onImportNpps,
  onImportDispensers,
  onImportMixers,
  onImportComputers,
  onImportPrinters,
  onClose
}) {
  const [importType, setImportType] = useState(defaultImportType);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]); // parsed rows from Excel
  const [validRows, setValidRows] = useState([]);
  const [errorRows, setErrorRows] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef();

  const config = IMPORT_CONFIGS[importType];

  // ── Parse an Excel/CSV file ──────────────────
  const parseFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (jsonData.length < 2) {
          alert('File Excel không có dữ liệu! Vui lòng kiểm tra lại.');
          return;
        }

        // Skip header row (row 0)
        const dataRows = jsonData.slice(1).filter(row =>
          row.some(cell => String(cell).trim() !== '')
        );

        // Map rows to objects
        const keys = config.columns.map(c => c.key);
        const existingSerials = new Set([
          ...existingDispensers.map(d => d.serial?.toLowerCase()),
          ...existingMixers.map(m => m.serial?.toLowerCase()),
          ...existingComputers.map(c => c.serial?.toLowerCase()),
          ...existingPrinters.map(p => p.serial?.toLowerCase()),
        ]);
        const existingNppNames = new Set(existingNpps.map(n => n.name?.trim().toLowerCase()));

        const valid = [];
        const errors = [];

        dataRows.forEach((row, idx) => {
          const obj = {};
          keys.forEach((key, i) => {
            const rawVal = String(row[i] || '').trim();
            // Sanitize against CSV Injection and limit character length to 250
            obj[key] = sanitizeText(sanitizeForSheet(rawVal), 250);
          });

          const issues = [];

          // Validate required fields
          config.columns.forEach(col => {
            if (col.required && !obj[col.key]) {
              issues.push(`Thiếu "${col.label}"`);
            }
          });

          // Specific format validation checks for imported rows
          if (obj.phone) {
            const phoneCheck = validatePhone(obj.phone);
            if (!phoneCheck.valid) {
              issues.push(phoneCheck.error);
            }
          }
          if (importType !== 'npp' && obj.serial) {
            const serialCheck = validateSerial(obj.serial);
            if (!serialCheck.valid) {
              issues.push(serialCheck.error);
            }
          }
          if (obj.locationCoordinates) {
            const gpsCheck = validateGps(obj.locationCoordinates);
            if (!gpsCheck.valid) {
              issues.push(gpsCheck.error);
            }
          }

          // Duplicate check
          if (importType !== 'npp' && obj.serial) {
            if (existingSerials.has(obj.serial.toLowerCase())) {
              issues.push(`Số Seri "${obj.serial}" đã tồn tại trong hệ thống`);
            }
          }
          if (importType === 'npp' && obj.name) {
            if (existingNppNames.has(obj.name.toLowerCase())) {
              issues.push(`NPP "${obj.name}" đã tồn tại trong hệ thống`);
            }
          }

          // Normalize
          if (obj.region) obj.region = normalizeRegion(obj.region);
          if (!obj.status) obj.status = importType === 'npp' ? 'Đang hợp tác' : 'Đang chạy tốt';
          if (!obj.type && importType === 'computer') obj.type = 'Case';
          if (!obj.connection && importType === 'printer') obj.connection = 'USB';

          const rowEntry = { ...obj, _rowIndex: idx + 2, _issues: issues };
          if (issues.length > 0) {
            errors.push(rowEntry);
          } else {
            valid.push(rowEntry);
          }
        });

        setRawRows(dataRows);
        setValidRows(valid);
        setErrorRows(errors);
        setSelectedRows(new Set(valid.map((_, i) => i)));
      } catch (err) {
        alert(`Lỗi đọc file: ${err.message}\nVui lòng kiểm tra định dạng file Excel (.xlsx / .xls / .csv)`);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [config, importType, existingNpps, existingDispensers, existingMixers, existingComputers, existingPrinters]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) parseFile(file);
  };

  const toggleRow = (index) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === validRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(validRows.map((_, i) => i)));
    }
  };

  // ── Confirm Import ──────────────────────────
  const handleImport = async () => {
    const rowsToImport = validRows.filter((_, i) => selectedRows.has(i));
    if (rowsToImport.length === 0) {
      alert('Vui lòng chọn ít nhất 1 dòng hợp lệ để import!');
      return;
    }

    setImporting(true);
    await new Promise(r => setTimeout(r, 600)); // slight delay for UX

    const timestamp = Date.now();

    if (importType === 'npp') {
      const newNpps = rowsToImport.map((row, i) => ({
        id: `NPP-IMPORT-${String(timestamp + i).slice(-5)}`,
        name: row.name,
        phone: row.phone,
        contactPerson: row.contactPerson || '',
        region: row.region,
        province: row.province || '',
        address: row.address || '',
        locationCoordinates: row.locationCoordinates || '',
        googleMapsUrl: row.locationCoordinates ? `https://maps.google.com/?q=${encodeURIComponent(row.locationCoordinates)}` : '',
        status: row.status || 'Đang hợp tác',
        createdAt: new Date().toISOString().split('T')[0],
        photos: []
      }));
      onImportNpps(newNpps);
    }

    if (importType === 'dispenser') {
      const newItems = rowsToImport.map((row, i) => ({
        id: `DISP-IMP-${String(timestamp + i).slice(-5)}`,
        model: row.model,
        serial: row.serial,
        status: row.status || 'Đang chạy tốt',
        isAssigned: false,
        setCode: null
      }));
      onImportDispensers(newItems);
    }

    if (importType === 'mixer') {
      const newItems = rowsToImport.map((row, i) => ({
        id: `MIX-IMP-${String(timestamp + i).slice(-5)}`,
        model: row.model,
        type: row.type || 'Lắc xoay khép kín',
        serial: row.serial,
        status: row.status || 'Đang chạy tốt',
        isAssigned: false,
        setCode: null
      }));
      onImportMixers(newItems);
    }

    if (importType === 'computer') {
      const newItems = rowsToImport.map((row, i) => ({
        id: `PC-IMP-${String(timestamp + i).slice(-5)}`,
        type: row.type || 'Case',
        os: row.os,
        specs: row.specs || 'Core i3 / 8GB RAM / 256GB SSD',
        serial: row.serial,
        network: row.network || 'Có mạng LAN',
        isAssigned: false,
        setCode: null,
        stabilizer: { hasStabilizer: false, brand: null, isSelfBought: false }
      }));
      onImportComputers(newItems);
    }

    if (importType === 'printer') {
      const newItems = rowsToImport.map((row, i) => ({
        id: `PRN-IMP-${String(timestamp + i).slice(-5)}`,
        model: row.model || 'QL700',
        serial: row.serial,
        connection: row.connection || 'USB',
        status: row.status || 'Đang chạy tốt',
        isAssigned: false,
        setCode: null
      }));
      onImportPrinters(newItems);
    }

    setImporting(false);
    setImportResult({
      success: rowsToImport.length,
      skipped: errorRows.length,
      deselected: validRows.length - selectedRows.size
    });
  };

  // Reset when switching import type
  const handleTypeChange = (newType) => {
    setImportType(newType);
    setFileName('');
    setRawRows([]);
    setValidRows([]);
    setErrorRows([]);
    setSelectedRows(new Set());
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: '860px', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={22} color="var(--accent-emerald)" />
            <div>
              <h3 style={{ fontWeight: '800', fontSize: '1.05rem' }}>
                📥 Import Dữ Liệu Hàng Loạt Từ File Excel
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Hỗ trợ định dạng: .xlsx · .xls · .csv
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Step 1: Choose Import Type */}
          <div>
            <p className="form-label" style={{ marginBottom: '10px' }}>
              📌 Bước 1: Chọn Loại Dữ Liệu Cần Import
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(IMPORT_CONFIGS).map(([key, cfg]) => (
                <button
                  key={key}
                  className={`btn btn-sm ${importType === key ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleTypeChange(key)}
                >
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Download Template */}
          <div style={{
            padding: '14px 16px',
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div>
              <p style={{ fontWeight: '700', fontSize: '0.875rem', color: '#34d399' }}>
                📋 Bước 2: Tải File Excel Mẫu Chuẩn Để Điền Dữ Liệu
              </p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                File mẫu có sẵn tiêu đề cột + 2 dòng ví dụ để bạn điền theo đúng định dạng.
              </p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => downloadTemplate(importType)}
              style={{ border: '1px solid rgba(16,185,129,0.4)', color: '#34d399' }}
            >
              <Download size={16} />
              <span>Tải File Mẫu Excel ({config.icon} {config.label})</span>
            </button>
          </div>

          {/* Step 3: Upload Zone */}
          <div>
            <p className="form-label" style={{ marginBottom: '10px' }}>
              📤 Bước 3: Tải Lên File Excel Đã Điền Dữ Liệu
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                borderRadius: '12px',
                padding: '32px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragOver ? 'rgba(6,182,212,0.08)' : 'var(--bg-main)',
                transition: 'all 0.2s ease'
              }}
            >
              <Upload size={36} color={isDragOver ? 'var(--accent-cyan)' : 'var(--text-muted)'} style={{ margin: '0 auto 10px auto', display: 'block' }} />
              {fileName ? (
                <p style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>✓ Đã chọn: {fileName}</p>
              ) : (
                <>
                  <p style={{ fontWeight: '600', marginBottom: '4px' }}>Kéo thả file Excel vào đây</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>hoặc nhấp để mở hộp thoại chọn file</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </div>
          </div>

          {/* Step 4: Preview Table */}
          {(validRows.length > 0 || errorRows.length > 0) && !importResult && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <p className="form-label" style={{ marginBottom: 0 }}>
                  👁️ Bước 4: Xem Trước & Chọn Dữ Liệu Cần Import
                </p>
                <div style={{ display: 'flex', gap: '10px', fontSize: '0.825rem' }}>
                  <span className="badge badge-success">✓ {validRows.length} dòng hợp lệ</span>
                  {errorRows.length > 0 && (
                    <span className="badge badge-danger">⚠️ {errorRows.length} dòng lỗi / trùng</span>
                  )}
                </div>
              </div>

              {/* Valid Rows Table */}
              {validRows.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{
                    padding: '8px 12px',
                    background: 'rgba(16,185,129,0.08)',
                    borderRadius: '6px 6px 0 0',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderBottom: 'none',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    color: '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>✓ Dòng Hợp Lệ ({validRows.length} dòng)</span>
                    <button
                      onClick={toggleAll}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' }}
                    >
                      {selectedRows.size === validRows.length ? 'Bỏ Chọn Tất Cả' : 'Chọn Tất Cả'}
                    </button>
                  </div>
                  <div className="data-table-container" style={{ borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>☑️</th>
                          <th>Dòng</th>
                          {config.columns.map(col => (
                            <th key={col.key}>{col.label.split('(')[0].trim()}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.map((row, i) => (
                          <tr key={i} style={{ opacity: selectedRows.has(i) ? 1 : 0.4 }}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedRows.has(i)}
                                onChange={() => toggleRow(i)}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              #{row._rowIndex}
                            </td>
                            {config.columns.map(col => (
                              <td key={col.key}>{row[col.key] || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Error Rows */}
              {errorRows.length > 0 && (
                <div>
                  <div style={{
                    padding: '8px 12px',
                    background: 'rgba(244,63,94,0.08)',
                    borderRadius: '6px 6px 0 0',
                    border: '1px solid rgba(244,63,94,0.3)',
                    borderBottom: 'none',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    color: '#fb7185',
                  }}>
                    ⚠️ Dòng Lỗi / Trùng ({errorRows.length} dòng – Sẽ bị bỏ qua):
                  </div>
                  <div className="data-table-container" style={{ borderRadius: '0 0 6px 6px', maxHeight: '150px', overflowY: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '0.78rem' }}>
                      <thead>
                        <tr>
                          <th>Dòng</th>
                          {config.columns.slice(0, 3).map(col => (
                            <th key={col.key}>{col.label.split('(')[0].trim()}</th>
                          ))}
                          <th>Lý Do Lỗi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorRows.map((row, i) => (
                          <tr key={i} style={{ background: 'rgba(244,63,94,0.05)' }}>
                            <td style={{ color: '#fb7185', fontFamily: 'var(--font-mono)' }}>#{row._rowIndex}</td>
                            {config.columns.slice(0, 3).map(col => (
                              <td key={col.key}>{row[col.key] || '—'}</td>
                            ))}
                            <td style={{ color: '#fb7185', fontSize: '0.75rem' }}>
                              {row._issues.join('; ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import Result Banner */}
          {importResult && (
            <div style={{
              padding: '20px',
              background: 'rgba(16,185,129,0.12)',
              border: '2px solid rgba(16,185,129,0.4)',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <CheckCircle2 size={40} color="#34d399" style={{ margin: '0 auto 10px', display: 'block' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#34d399', marginBottom: '8px' }}>
                ✅ Import Dữ Liệu Thành Công!
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                Đã thêm <strong style={{ color: '#34d399' }}>{importResult.success}</strong> bản ghi mới vào hệ thống.
                {importResult.skipped > 0 && ` Đã bỏ qua ${importResult.skipped} dòng lỗi/trùng.`}
              </p>
              <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={onClose}>
                Đóng & Xem Kết Quả
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        {!importResult && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Hủy Bỏ</button>

            {validRows.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || selectedRows.size === 0}
                style={{ minWidth: '220px' }}
              >
                {importing ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Đang Import Dữ Liệu...</span>
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    <span>✅ Xác Nhận Import {selectedRows.size} Dòng Hợp Lệ</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
