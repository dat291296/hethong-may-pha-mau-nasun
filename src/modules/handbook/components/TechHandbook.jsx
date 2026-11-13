import { searchText } from '../../../shared/utils/searchText.js';
import React, { useState, useEffect, useMemo } from 'react';
import { compressImage } from '../../../shared/utils/imageCompressor.js';
import { validateDocumentFile } from '../lib/technicalResources.js';
import { userErrorMessage } from '../../../shared/security/userError.js';
import {
  BookOpen,
  Search,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Info,
  PlusCircle,
  FileText,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Filter,
  Check,
  User,
  Clock,
  Tag,
  Edit3,
  Trash2,
  Plus,
  RotateCcw
} from 'lucide-react';
import SafePortal from '../../../shared/components/SafePortal';
import { confirmAction } from '../../../shared/utils/confirmDialog.js';
import TechnicalResources from './TechnicalResources';
import { cacheOfflineData, getCachedOfflineData } from '../../../shared/sync/offlineSync.js';

import {
  ERROR_CODES_DATA,
  TECHNICAL_SOPS_DATA,
  NASUN_SERVICE_SOPS,
  FIELD_TIPS_DATA
} from '../data/troubleshootingData.js';

async function downloadHandbook(title, metadata, sections) {
  try {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ compress: true });
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    const margin = 95;
    let y = margin;
    const clearPage = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      y = margin;
    };
    const addPageImage = () => pdf.addImage(canvas, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    const write = (value, size = 24, bold = false) => {
      ctx.font = `${bold ? 700 : 400} ${size}px sans-serif`;
      const lineHeight = Math.ceil(size * 1.45);
      const draw = line => {
        if (y + lineHeight > canvas.height - margin) {
          addPageImage();
          pdf.addPage();
          clearPage();
        }
        ctx.fillStyle = bold ? '#155e75' : '#172033';
        ctx.textBaseline = 'top';
        ctx.fillText(line, margin, y);
        y += lineHeight;
      };
      for (const paragraph of String(value).split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(candidate).width > canvas.width - margin * 2) {
            draw(line);
            line = '';
          }
          if (ctx.measureText(word).width > canvas.width - margin * 2) {
            for (const character of word) {
              if (ctx.measureText(line + character).width > canvas.width - margin * 2) {
                draw(line);
                line = '';
              }
              line += character;
            }
          } else {
            line = line ? `${line} ${word}` : word;
          }
        }
        draw(line);
      }
    };
    clearPage();
    write('NASUN · Sổ tay kỹ thuật', 24, true);
    write(title, 42, true);
    write(metadata.filter(Boolean).join(' · '));
    for (const [heading, content] of sections) {
      const entries = (Array.isArray(content) ? content : [content]).filter(Boolean);
      if (!entries.length) continue;
      y += 18;
      write(heading, 30, true);
      entries.forEach((entry, index) => write(Array.isArray(content) ? `${index + 1}. ${entry}` : entry));
    }
    addPageImage();
    pdf.save(`${title.replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0, 100) || 'NASUN'}.pdf`);
  } catch (error) {
    console.error('Handbook PDF export failed', error);
    window.alert('Không tạo được tệp PDF. Hãy thử lại.');
  }
}

export default function TechHandbook({ globalSearch = '', onSelectErrorForRepair }) {
  const [activeSubTab, setActiveSubTab] = useState('ERRORS'); // 'ERRORS' | 'SOPS' | 'TIPS'

  const [errorCodes, setErrorCodes] = useState(ERROR_CODES_DATA);
  const [errorsHydrated, setErrorsHydrated] = useState(false);

  useEffect(() => {
    if (errorsHydrated) cacheOfflineData('tech_handbook_errors', errorCodes);
  }, [errorCodes, errorsHydrated]);

  useEffect(() => {
    getCachedOfflineData('tech_handbook_errors', null).then(cached => {
      if (Array.isArray(cached) && cached.length > 0) setErrorCodes(cached);
    }).finally(() => setErrorsHydrated(true));
  }, []);

  // Error Code Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => { setSearchTerm(globalSearch); }, [globalSearch]);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [modelFilter, setModelFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [expandedErrorId, setExpandedErrorId] = useState(null);

  // Add / Edit Error Modal State
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [editingError, setEditingError] = useState(null);
  const errorImageInput = React.useRef(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const [errorFormData, setErrorFormData] = useState({
    code: '',
    title: '',
    category: 'Máy chiết',
    machineModel: 'Satint A2',
    severity: 'MEDIUM',
    symptoms: '',
    rootCause: '',
    actionSteps: '',
    sparePartsNeeded: '',
    preventiveMaintenance: '',
    author: 'KTV. Kỹ Thuật Viên',
    images: []
  });
  const nextErrorCode = (category) => {
    const prefixes = { 'Máy chiết': 'MC', 'Máy lắc': 'ML', 'Máy in': 'MT', QL700: 'MT', Case: 'PC', AIO: 'PC', 'Màn hình': 'MH', 'Phần mềm': 'PM', Khác: 'LK' };
    const prefix = prefixes[category] || 'LK';
    const used = errorCodes.map(item => item.code).filter(code => code?.startsWith(`${prefix}-`)).map(code => Number(code.slice(prefix.length + 1))).filter(Number.isInteger);
    return `${prefix}-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
  };

  // Dynamic available models for filter
  const availableModels = useMemo(() => {
    const set = new Set();
    errorCodes.forEach(e => {
      if (e.machineModel) set.add(e.machineModel);
    });
    return Array.from(set);
  }, [errorCodes]);

  // Filter Error Codes
  const filteredErrors = useMemo(() => {
    const term = searchText(searchTerm).trim();
    return errorCodes.filter((item) => {
      let matchesSearch = true;
      if (term) {
        const targets = [
          item.code || '',
          item.title || '',
          item.machineModel || '',
          item.category || '',
          item.rootCause || '',
          item.preventiveMaintenance || '',
          item.sparePartsNeeded || '',
          ...(item.symptoms || []),
          ...(item.actionSteps || [])
        ];
        matchesSearch = term.split(/\s+/).every(word => targets.some(target => searchText(String(target)).includes(word)));
      }

      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      const matchesModel = modelFilter === 'ALL' || item.machineModel === modelFilter;
      const matchesSeverity = severityFilter === 'ALL' || item.severity === severityFilter;

      return matchesSearch && matchesCategory && matchesModel && matchesSeverity;
    });
  }, [errorCodes, searchTerm, categoryFilter, modelFilter, severityFilter]);

  const handleOpenAddError = () => {
    setEditingError(null);
    const category = 'Máy chiết';
    const nextCode = nextErrorCode(category);
    setErrorFormData({
      code: nextCode,
      title: '',
      category,
      machineModel: 'Satint A2',
      severity: 'MEDIUM',
      symptoms: '',
      rootCause: '',
      actionSteps: '',
      sparePartsNeeded: '',
      preventiveMaintenance: '',
      author: 'KTV. Kỹ Thuật Viên',
      images: []
    });
    setShowErrorModal(true);
  };

  const handleOpenEditError = (err) => {
    setEditingError(err);
    setErrorFormData({
      code: err.code || '',
      title: err.title || '',
      category: err.category || 'Máy chiết',
      machineModel: err.machineModel || '',
      severity: err.severity || 'MEDIUM',
      symptoms: Array.isArray(err.symptoms) ? err.symptoms.join('\n') : (err.symptoms || ''),
      rootCause: err.rootCause || '',
      actionSteps: Array.isArray(err.actionSteps) ? err.actionSteps.join('\n') : (err.actionSteps || ''),
      sparePartsNeeded: Array.isArray(err.sparePartsNeeded) ? err.sparePartsNeeded.join(', ') : (err.sparePartsNeeded || ''),
      preventiveMaintenance: err.preventiveMaintenance || '',
      author: err.author || 'KTV. Kỹ Thuật Viên',
      images: Array.isArray(err.images) ? err.images : []
    });
    setShowErrorModal(true);
  };

  const addErrorImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    setImageError('');
    if (!files.length) return;
    if (files.length + (errorFormData.images || []).length > 4) { setImageError('Tối đa 4 ảnh cho mỗi mã lỗi.'); return; }
    setImageBusy(true);
    try {
      const images = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) throw new Error('Chỉ nhận file ảnh.');
        await validateDocumentFile(file);
        images.push(await compressImage(file, 1280, 960, 0.72));
      }
      setErrorFormData(previous => ({ ...previous, images: [...(previous.images || []), ...images] }));
    } catch (error) { setImageError(userErrorMessage(error)); }
    finally { setImageBusy(false); }
  };

  const handleDeleteError = async (err) => {
    if (await confirmAction(`Bạn có chắc muốn xóa mã lỗi [${err.code}] ${err.title}?`, { title: 'Xác nhận xóa mã lỗi', confirmLabel: 'Xóa mã lỗi', danger: true })) {
      setErrorCodes(prev => prev.filter(e => e.id !== err.id));
    }
  };

  const handleResetDefaultErrors = async () => {
    if (await confirmAction('Khôi phục danh sách mã lỗi về mặc định ban đầu?', { title: 'Khôi phục dữ liệu mặc định', confirmLabel: 'Khôi phục', danger: true })) {
      setErrorCodes(ERROR_CODES_DATA);
    }
  };

  const handleSaveErrorSubmit = (e) => {
    e.preventDefault();
    if (!errorFormData.code.trim() || !errorFormData.title.trim()) {
      alert('Vui lòng nhập Mã lỗi và Tên lỗi!');
      return;
    }
    const normalizedCode = errorFormData.code.trim().toUpperCase();
    if (errorCodes.some(item => item.code?.trim().toUpperCase() === normalizedCode && item.id !== editingError?.id)) {
      alert('Mã lỗi này đã tồn tại. Hãy dùng mã khác để tránh trùng hồ sơ.');
      return;
    }

    const symptomsArr = errorFormData.symptoms
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const actionStepsArr = errorFormData.actionSteps
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (editingError) {
      setErrorCodes(prev => prev.map(item => {
        if (item.id === editingError.id) {
          return {
            ...item,
            code: normalizedCode,
            title: errorFormData.title.trim(),
            category: errorFormData.category,
            machineModel: errorFormData.machineModel.trim(),
            severity: errorFormData.severity,
            symptoms: symptomsArr.length > 0 ? symptomsArr : ['Chưa có thông tin dấu hiệu'],
            rootCause: errorFormData.rootCause.trim(),
            actionSteps: actionStepsArr.length > 0 ? actionStepsArr : ['Chưa có thông tin quy trình khắc phục'],
            sparePartsNeeded: errorFormData.sparePartsNeeded.trim(),
            preventiveMaintenance: errorFormData.preventiveMaintenance.trim(),
            images: errorFormData.images || [],
            author: errorFormData.author.trim() || 'KTV. Kỹ Thuật Viên'
          };
        }
        return item;
      }));
    } else {
      const newErr = {
        id: `ERR-${Date.now()}`,
        code: normalizedCode,
        title: errorFormData.title.trim(),
        category: errorFormData.category,
        machineModel: errorFormData.machineModel.trim() || 'Chung',
        severity: errorFormData.severity,
        symptoms: symptomsArr.length > 0 ? symptomsArr : ['Chưa có thông tin dấu hiệu'],
        rootCause: errorFormData.rootCause.trim(),
        actionSteps: actionStepsArr.length > 0 ? actionStepsArr : ['Chưa có thông tin quy trình khắc phục'],
        sparePartsNeeded: errorFormData.sparePartsNeeded.trim(),
        preventiveMaintenance: errorFormData.preventiveMaintenance.trim(),
        images: errorFormData.images || [],
        author: errorFormData.author.trim() || 'KTV. Kỹ Thuật Viên'
      };
      setErrorCodes(prev => [newErr, ...prev]);
    }

    setShowErrorModal(false);
  };

  // Field Tips State
  const [fieldTips, setFieldTips] = useState(FIELD_TIPS_DATA);
  const [tipsHydrated, setTipsHydrated] = useState(false);
  const [showAddTipModal, setShowAddTipModal] = useState(false);
  const [newTip, setNewTip] = useState({
    title: '',
    author: 'KTV. Kỹ Thuật Viên',
    tags: '',
    content: ''
  });

  const [sops, setSops] = useState(() => [...NASUN_SERVICE_SOPS, ...TECHNICAL_SOPS_DATA]);
  const [sopsReady, setSopsReady] = useState(false);
  const [sopDraft, setSopDraft] = useState(null);
  const [tipId, setTipId] = useState(null);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    getCachedOfflineData('tech_handbook_sops', null).then(cached => {
      if (cached?.version === 1 && Array.isArray(cached.items)) {
        setSops(cached.items);
      } else if (Array.isArray(cached)) {
        const savedIds = new Set(cached.map(sop => sop.id));
        setSops([...NASUN_SERVICE_SOPS.filter(sop => !savedIds.has(sop.id)), ...cached]);
      }
      setSopsReady(true);
    }).catch(() => setStorageError('Không tải được quy trình đã lưu.'));
  }, []);

  async function saveHandbookItems(key, items, apply) {
    try {
      await cacheOfflineData(key, key === 'tech_handbook_sops' ? { version: 1, items } : items);
      apply(items);
      setStorageError('');
      return true;
    } catch {
      setStorageError('Không lưu được thay đổi. Hãy thử lại.');
      return false;
    }
  }

  // Expandable SOPs state
  const [expandedSopId, setExpandedSopId] = useState('SOP-01');

  useEffect(() => {
    getCachedOfflineData('tech_handbook_field_tips', null).then(cached => {
      if (Array.isArray(cached)) setFieldTips(cached);
      setTipsHydrated(true);
    }).catch(() => setStorageError('Không tải được mẹo đã lưu.'));
  }, []);

  // Severity Badge Helper
  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ShieldAlert size={12} /> CRITICAL (Nghiêm trọng)</span>;
      case 'HIGH':
        return <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> HIGH (Mức độ cao)</span>;
      case 'MEDIUM':
        return <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: '700' }}>MEDIUM (Vừa)</span>;
      default:
        return <span className="badge badge-info">LIGHT (Nhẹ)</span>;
    }
  };

  const handleAddTipSubmit = async (e) => {
    e.preventDefault();
    if (!newTip.title.trim() || !newTip.content.trim()) {
      alert('Vui lòng điền đầy đủ tiêu đề và nội dung mẹo thực địa!');
      return;
    }

    const createdTip = {
      id: tipId || `TIP-${(globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36))}`,
      title: newTip.title,
      author: newTip.author || 'KTV. Hiện Trường',
      date: fieldTips.find(tip => tip.id === tipId)?.date || new Date().toISOString().split('T')[0],
      tags: newTip.tags ? newTip.tags.split(',').map((t) => t.trim()) : ['Thực địa', 'Kỹ thuật'],
      content: newTip.content
    };

    const next = tipId ? fieldTips.map(tip => tip.id === tipId ? createdTip : tip) : [createdTip, ...fieldTips];
    if (!await saveHandbookItems('tech_handbook_field_tips', next, setFieldTips)) return;
    setTipId(null);
    setShowAddTipModal(false);
    setNewTip({ title: '', author: 'KTV. Kỹ Thuật Viên', tags: '', content: '' });
  };

  return (
    <div className="workspace-screen techhandbook-screen" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)', borderLeft: '4px solid var(--accent-cyan)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <BookOpen size={28} color="var(--accent-cyan)" />
              <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                Sổ Tay Kỹ Thuật & Tra Cứu Sự Cố
              </h2>
              <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>V2.5 Tech Hub</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
              Cơ sở dữ liệu mã lỗi máy pha màu Nasun, quy trình bảo dưỡng chuẩn (SOPs) và kinh nghiệm xử lý nhanh cho Kỹ thuật viên.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="handbook-tabs" style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px' }}>
            <button type="button" className="handbook-document-tab" aria-pressed={activeSubTab === 'DOCUMENTS'} onClick={() => setActiveSubTab('DOCUMENTS')}><FileText size={16}/>Tài liệu & bản vẽ</button>
            <button
              onClick={() => setActiveSubTab('ERRORS')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'ERRORS' ? 'var(--accent-cyan)' : 'transparent',
                color: activeSubTab === 'ERRORS' ? '#0f172a' : 'var(--text-muted)',
                fontWeight: activeSubTab === 'ERRORS' ? '700' : '500',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <AlertTriangle size={16} />
              <span>Tra Cứu Mã Lỗi ({errorCodes.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('SOPS')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'SOPS' ? 'var(--accent-cyan)' : 'transparent',
                color: activeSubTab === 'SOPS' ? '#0f172a' : 'var(--text-muted)',
                fontWeight: activeSubTab === 'SOPS' ? '700' : '500',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <FileText size={16} />
              <span>Quy Trình Chuẩn SOPs ({sops.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('TIPS')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'TIPS' ? 'var(--accent-cyan)' : 'transparent',
                color: activeSubTab === 'TIPS' ? '#0f172a' : 'var(--text-muted)',
                fontWeight: activeSubTab === 'TIPS' ? '700' : '500',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <Lightbulb size={16} />
              <span>Mẹo Thực Địa ({fieldTips.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* 🔴 SUB-TAB 1: TRA CỨU & QUẢN LÝ MÃ LỖI */}
      {activeSubTab === 'ERRORS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Action Toolbar */}
          <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Hiển thị <strong>{filteredErrors.length}</strong> / <strong>{errorCodes.length}</strong> mã sự cố máy
              </span>
              {searchTerm && (
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                  Khớp tìm kiếm "{searchTerm}"
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleResetDefaultErrors}
                title="Khôi phục danh sách mã lỗi chuẩn từ dữ liệu mẫu"
              >
                <RotateCcw size={14} />
                <span>Khôi Phục Mặc Định</span>
              </button>
              <button 
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleOpenAddError}
              >
                <Plus size={14} />
                <span>Thêm Mã Lỗi Mới</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', gridColumn: 'span 2' }}>
                <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="🔍 Tra cứu theo mã lỗi (E-01..), tên lỗi, model máy, linh kiện, phân loại thiết bị..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: '38px',
                    paddingRight: '12px',
                    height: '42px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              {/* Category Filter */}
              <div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '0 12px',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="ALL">📦 Tất cả Phân loại</option>
                  <option value="Máy chiết">Máy chiết</option>
                  <option value="Máy lắc">Máy lắc</option>
                  <option value="Case">Case</option>
                  <option value="AIO">AIO</option>
                  <option value="QL700">QL700</option>
                  <option value="Màn hình">Màn hình</option>
                  <option value="Phần mềm">Phần mềm pha màu</option>
                  <option value="Khác">Khác / Linh kiện</option>
                </select>
              </div>

              {/* Model Filter */}
              <div>
                <select
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '0 12px',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="ALL">⚙️ Tất cả Dòng Máy ({availableModels.length})</option>
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Severity Filter */}
              <div>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '0 12px',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="ALL">🔴 Mức độ nghiêm trọng</option>
                  <option value="CRITICAL">CRITICAL (Khẩn cấp)</option>
                  <option value="HIGH">HIGH (Nặng)</option>
                  <option value="MEDIUM">MEDIUM (Vừa)</option>
                  <option value="LIGHT">LIGHT (Nhẹ)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredErrors.length === 0 ? (
              <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Info size={36} color="var(--accent-cyan)" style={{ marginBottom: '12px', opacity: 0.6 }} />
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Không tìm thấy mã lỗi phù hợp với bộ lọc!</p>
                <span style={{ fontSize: '0.8rem' }}>Thử thay đổi từ khóa hoặc bấm "Thêm Mã Lỗi Mới" để ghi nhận lỗi này.</span>
              </div>
            ) : (
              filteredErrors.map((error) => {
                const isExpanded = expandedErrorId === error.id;
                return (
                  <div
                    key={error.id}
                    className="glass-panel"
                    style={{
                      padding: '18px 22px',
                      borderLeft: `4px solid ${
                        error.severity === 'CRITICAL'
                          ? '#ef4444'
                          : error.severity === 'HIGH'
                          ? '#f59e0b'
                          : 'var(--accent-cyan)'
                      }`,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Header Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                      onClick={() => setExpandedErrorId(isExpanded ? null : error.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            background: 'rgba(6, 182, 212, 0.15)',
                            color: 'var(--accent-cyan)',
                            border: '1px solid rgba(6, 182, 212, 0.3)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontWeight: '900',
                            fontSize: '0.95rem',
                            letterSpacing: '0.05em'
                          }}
                        >
                          {error.code}
                        </span>

                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>
                          {error.title}
                        </h3>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                            {error.category} ({error.machineModel})
                          </span>
                          {getSeverityBadge(error.severity)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 10px' }}
                          title="Chỉnh sửa mã lỗi"
                          onClick={() => handleOpenEditError(error)}
                        >
                          <Edit3 size={14} color="var(--accent-amber)" />
                          <span>Sửa</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 10px' }}
                          title="Xóa mã lỗi"
                          onClick={() => handleDeleteError(error)}
                        >
                          <Trash2 size={14} color="#ef4444" />
                          <span>Xóa</span>
                        </button>

                        {onSelectErrorForRepair && (
                          <button
                            type="button"
                            onClick={() => onSelectErrorForRepair(error)}
                            className="btn btn-primary btn-sm"
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            title="Chuyển sang màn hình Sửa Chữa và tạo phiếu tự động"
                          >
                            <Wrench size={14} />
                            <span>Tạo Phiếu Sửa Chữa</span>
                          </button>
                        )}

                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          onClick={() => setExpandedErrorId(isExpanded ? null : error.id)}
                        >
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail Content */}
                    {isExpanded && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => downloadHandbook(
                          `${error.code} · ${error.title}`, [error.category, error.machineModel, error.severity, error.author],
                          [['Dấu hiệu', error.symptoms], ['Nguyên nhân', error.rootCause], ['Cách xử lý', error.actionSteps],
                            ['Linh kiện', error.sparePartsNeeded], ['Phòng tránh', error.preventiveMaintenance]]
                        )}>Xuất PDF</button>
                        {sops.filter(sop => {
                          const category = searchText(error.category);
                          const relatedId = { 'may chiet': '04', 'may lac': '05', 'may tinh': '06', 'phan mem': '06', 'may in': '06' }[category];
                          return relatedId && sop.id === `NASUN-SOP-${relatedId}`;
                        }).map(sop => (
                          <button key={sop.id} type="button" className="btn btn-secondary" onClick={() => {
                            setExpandedSopId(sop.id);
                            setActiveSubTab('SOPS');
                            requestAnimationFrame(() => document.getElementById(sop.id)?.scrollIntoView({ block: 'start' }));
                          }}>SOP gợi ý · {sop.title}</button>
                        ))}
                        {/* Symptoms */}
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
                            🔍 Dấu hiệu nhận biết lỗi:
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {(error.symptoms || []).map((sym, idx) => (
                              <li key={idx} style={{ marginBottom: '3px' }}>{sym}</li>
                            ))}
                          </ul>
                        </div>

                        {(error.images || []).length > 0 && <section aria-label="Hình ảnh minh họa" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>{error.images.map((src, index) => <a href={src} target="_blank" rel="noreferrer" key={`${index}-${src.slice(0,24)}`}><img loading="lazy" src={src} alt={`${error.code} · ảnh minh họa ${index + 1}`} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-color)' }} /></a>)}</section>}

                        {/* Root Cause */}
                        <div style={{ background: 'rgba(239, 68, 68, 0.06)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
                            ⚡ Nguyên nhân lỗi (Root Cause):
                          </span>
                          <span style={{ fontSize: '0.875rem', color: '#fca5a5' }}>
                            {error.rootCause}
                          </span>
                        </div>

                        {/* Action Steps */}
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                            🛠️ Quy trình khắc phục, sửa chữa từng bước:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {(error.actionSteps || []).map((step, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '10px',
                                  background: 'rgba(15, 23, 42, 0.4)',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid rgba(255,255,255,0.05)'
                                }}
                              >
                                <span
                                  style={{
                                    background: 'var(--accent-cyan)',
                                    color: '#0f172a',
                                    fontWeight: '900',
                                    fontSize: '0.75rem',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    marginTop: '2px'
                                  }}
                                >
                                  {idx + 1}
                                </span>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>
                                  {step}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Spare parts needed */}
                        {error.sparePartsNeeded && (
                          <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--accent-blue)', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>
                              🔧 Linh kiện thay thế:
                            </div>
                            <span style={{ fontSize: '0.875rem', color: '#93c5fd', fontWeight: '500' }}>
                              {Array.isArray(error.sparePartsNeeded) ? error.sparePartsNeeded.join(', ') : error.sparePartsNeeded}
                            </span>
                          </div>
                        )}

                        {/* Preventive Maintenance & Author */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', fontSize: '0.775rem', color: 'var(--text-muted)', paddingTop: '8px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={14} color="#10b981" />
                            <strong>Cách phòng tránh:</strong> {error.preventiveMaintenance}
                          </span>
                          <span style={{ fontStyle: 'italic' }}>Biên soạn: {error.author}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 🔴 MODAL THÊM / SỬA MÃ LỖI SỔ TAY KỸ THUẬT */}
      {showErrorModal && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '680px' }}>
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>
                  {editingError ? `Chỉnh Sửa Mã Lỗi [${editingError.code}]` : 'Thêm Mã Lỗi Mới Vào Sổ Tay'}
                </h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowErrorModal(false)}>✕</button>
              </div>
              <form onSubmit={handleSaveErrorSubmit}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '72vh', overflowY: 'auto' }}>
                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '700' }}>🏷️ Mã Lỗi (VD: E-01, M-03, P-05) *</label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        placeholder="VD: E-18..."
                        value={errorFormData.code}
                        onChange={e => setErrorFormData({ ...errorFormData, code: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '700' }}>🔴 Mức Độ Nghiêm Trọng</label>
                      <select
                        className="form-select"
                        value={errorFormData.severity}
                        onChange={e => setErrorFormData({ ...errorFormData, severity: e.target.value })}
                      >
                        <option value="CRITICAL">🔴 CRITICAL (Khẩn cấp / Dừng máy)</option>
                        <option value="HIGH">🟠 HIGH (Nặng)</option>
                        <option value="MEDIUM">🟡 MEDIUM (Vừa)</option>
                        <option value="LIGHT">🟢 LIGHT (Nhẹ)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '700' }}>📝 Tên Lỗi / Mô Tả Ngắn *</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="VD: Lỗi lệch góc van chiết xoay, kẹt pít-tông..."
                      value={errorFormData.title}
                      onChange={e => setErrorFormData({ ...errorFormData, title: e.target.value })}
                    />
                  </div>

                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">📂 Phân Loại Thiết Bị *</label>
                      <select
                        className="form-select"
                        value={errorFormData.category}
                        onChange={e => setErrorFormData({ ...errorFormData, category: e.target.value, code: editingError ? errorFormData.code : nextErrorCode(e.target.value) })}
                      >
                        <option value="Máy chiết">Máy chiết</option>
                        <option value="Máy lắc">Máy lắc</option>
                        <option value="Case">Case</option>
                        <option value="AIO">AIO</option>
                        <option value="QL700">QL700</option>
                        <option value="Màn hình">Màn hình</option>
                        <option value="Phần mềm">Phần mềm pha màu</option>
                        <option value="Khác">Khác / Linh kiện</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">⚙️ Model Máy Áp Dụng *</label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        placeholder="VD: Satint A2, Satint AIO, Natos V1, QL-700..."
                        value={errorFormData.machineModel}
                        onChange={e => setErrorFormData({ ...errorFormData, machineModel: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '700', color: '#f59e0b' }}>
                      🔍 Dấu Hiệu Nhận Biết Lỗi (Mỗi dòng một dấu hiệu) *
                    </label>
                    <textarea
                      className="form-input"
                      rows={3}
                      required
                      placeholder="VD:&#10;Máy phát tiếng cạch cạch khi đẩy màu&#10;Đèn đỏ nhấp nháy 3 lần"
                      value={errorFormData.symptoms}
                      onChange={e => setErrorFormData({ ...errorFormData, symptoms: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '700', color: '#ef4444' }}>
                      ⚡ Nguyên Nhân Lỗi (Root Cause) *
                    </label>
                    <textarea
                      className="form-input"
                      rows={2}
                      required
                      placeholder="VD: Cặn sơn bám dính xy-lanh hoặc cảm biến quang đĩa van bị bám bụi..."
                      value={errorFormData.rootCause}
                      onChange={e => setErrorFormData({ ...errorFormData, rootCause: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>
                      🛠️ Quy Trình Khắc Phục, Sửa Chữa (Mỗi dòng một bước thực hiện) *
                    </label>
                    <textarea
                      className="form-input"
                      rows={4}
                      required
                      placeholder="VD:&#10;Bước 1: Tắt nguồn máy và ngắt điện áp&#10;Bước 2: Dùng cồn Isopropyl 99% vệ sinh mắt đọc cảm biến&#10;Bước 3: Cắm lại giắc cáp và chạy test chẩn đoán"
                      value={errorFormData.actionSteps}
                      onChange={e => setErrorFormData({ ...errorFormData, actionSteps: e.target.value })}
                    />
                  </div>

                  <section className="form-group" aria-label="Hình ảnh minh họa mã lỗi" style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 14 }}>
                    <label className="form-label" style={{ fontWeight: 800 }}>📷 Hình ảnh minh họa (tối đa 4 ảnh)</label>
                    <p className="resource-muted">Thêm ảnh lỗi, vị trí linh kiện hoặc thao tác sửa chữa. Ảnh được nén trước khi lưu.</p>
                    <input ref={errorImageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff" multiple hidden onChange={addErrorImages} />
                    <button type="button" className="btn btn-secondary" disabled={imageBusy || (errorFormData.images || []).length >= 4} onClick={() => errorImageInput.current?.click()}>{imageBusy ? 'Đang xử lý ảnh…' : 'Chọn hình ảnh'}</button>
                    {imageError && <p className="resource-error" role="alert">{imageError}</p>}
                    {(errorFormData.images || []).length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginTop: 12 }}>{errorFormData.images.map((src, index) => <figure key={`${index}-${src.slice(0,24)}`} style={{ margin: 0, position: 'relative' }}><img src={src} alt={`Ảnh minh họa ${index + 1}`} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-color)' }} /><button type="button" className="btn btn-secondary btn-sm" aria-label={`Xóa ảnh ${index + 1}`} onClick={() => setErrorFormData(previous => ({ ...previous, images: previous.images.filter((_, imageIndex) => imageIndex !== index) }))}>Xóa ảnh</button></figure>)}</div>}
                  </section>

                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">🔧 Linh Kiện Thay Thế</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="VD: Zoăng pít-tông, Cảm biến van xoay, Nguồn 24V..."
                        value={errorFormData.sparePartsNeeded}
                        onChange={e => setErrorFormData({ ...errorFormData, sparePartsNeeded: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">🛡️ Cách Phòng Tránh</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="VD: Vệ sinh đầu vòi định kỳ 1 tuần/lần..."
                        value={errorFormData.preventiveMaintenance}
                        onChange={e => setErrorFormData({ ...errorFormData, preventiveMaintenance: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">👤 Kỹ Thuật Viên Biên Soạn</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="VD: KTV. Nguyễn Văn Hùng"
                      value={errorFormData.author}
                      onChange={e => setErrorFormData({ ...errorFormData, author: e.target.value })}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowErrorModal(false)}>
                    Hủy Bỏ
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingError ? 'Lưu Thay Đổi' : 'Thêm Vào Sổ Tay'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      {/* 📋 SUB-TAB 2: QUY TRÌNH CHUẨN SOPs */}
      {activeSubTab === 'SOPS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {storageError && <p role="alert">{storageError}</p>}
          <button id="handbook-sop-editor" className="btn btn-primary" disabled={!sopsReady} onClick={() => setSopDraft({ title: '', machineType: '', duration: '', toolsRequired: [], steps: [{ title: '', desc: '' }] })}>Thêm quy trình</button>
          {sopDraft && (
            <form className="glass-panel sop-editor" onSubmit={async event => {
              event.preventDefault();
              const entry = { ...sopDraft, id: sopDraft.id || `SOP-${(globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36))}`, title: sopDraft.title.trim(),
                toolsRequired: sopDraft.toolsRequired.map(tool => tool.trim()).filter(Boolean),
                steps: sopDraft.steps.map((step, index) => ({ ...step, stepNumber: index + 1 })) };
              if (!entry.title || entry.steps.some(step => !step.title.trim())) return;
              const next = sopDraft.id ? sops.map(sop => sop.id === entry.id ? entry : sop) : [entry, ...sops];
              if (await saveHandbookItems('tech_handbook_sops', next, setSops)) {
                setExpandedSopId(entry.id);
                setSopDraft(null);
              }
            }}>
              <div className="sop-editor-meta">
              {[['title','Tiêu đề'],['machineType','Loại máy'],['duration','Thời lượng']].map(([key,label]) =>
                <label key={key}>{label}<input className="form-input" required={key === 'title'} value={sopDraft[key]} onChange={event => setSopDraft({ ...sopDraft, [key]: event.target.value })}/></label>)}
              <label>Dụng cụ (cách nhau bằng dấu phẩy)<input className="form-input" value={sopDraft.toolsRequired.join(',')} onChange={event => setSopDraft({ ...sopDraft, toolsRequired: event.target.value.split(',') })}/></label>
              </div>
              {sopDraft.steps.map((step,index) => <fieldset key={index}><legend>Bước {index + 1}</legend>
                {[['title','Tên bước'],['desc','Hướng dẫn']].map(([key,label]) => <label key={key}>{label}<textarea rows={key === 'desc' ? 4 : 2} className="form-input" required={key === 'title'} value={step[key]} onChange={event => setSopDraft({ ...sopDraft, steps: sopDraft.steps.map((item,i) => i === index ? { ...item, [key]: event.target.value } : item) })}/></label>)}
                <button type="button" className="btn btn-secondary" disabled={sopDraft.steps.length === 1} onClick={() => setSopDraft({ ...sopDraft, steps: sopDraft.steps.filter((_,i) => i !== index) })}>Bỏ bước</button>
              </fieldset>)}
              <div className="sop-editor-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSopDraft({ ...sopDraft, steps: [...sopDraft.steps, { title: '', desc: '' }] })}>Thêm bước</button>
              <button type="button" className="btn btn-secondary" onClick={() => setSopDraft(null)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Lưu quy trình</button>
              </div>
            </form>
          )}
          {sops.map((sop) => {
            const isExpanded = expandedSopId === sop.id;
            return (
              <div
                key={sop.id}
                id={sop.id}
                className="glass-panel"
                style={{
                  padding: '20px 24px',
                  borderTop: '3px solid var(--accent-cyan)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  onClick={() => setExpandedSopId(isExpanded ? null : sop.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <FileText size={22} color="var(--accent-cyan)" />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>
                      {sop.title}
                    </h3>
                    <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                      {sop.machineType}
                    </span>
                    <span className="badge badge-info" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {sop.duration}
                    </span>
                  </div>

                  <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>

                <div className="workspace-actions">
                  <button className="btn btn-secondary" aria-expanded={isExpanded} onClick={() => setExpandedSopId(isExpanded ? null : sop.id)}>{isExpanded ? 'Thu gọn' : 'Xem'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => downloadHandbook(
                    sop.title, [sop.machineType, sop.duration],
                    [['Dụng cụ', sop.toolsRequired], ['Các bước', sop.steps.map(step => [step.title, step.desc].filter(Boolean).join('\n'))]]
                  )}>Xuất PDF</button>
                  <button className="btn btn-secondary" disabled={!sopsReady} onClick={() => { setSopDraft(sop); document.getElementById('handbook-sop-editor')?.scrollIntoView(); }}>Sửa</button>
                  <button className="btn btn-secondary" disabled={!sopsReady} onClick={() => {
                    if (window.confirm(`Xóa quy trình “${sop.title}”?`)) void saveHandbookItems('tech_handbook_sops', sops.filter(item => item.id !== sop.id), setSops);
                  }}>Xóa</button>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                    {sop.toolsRequired.length > 0 && <>
                      <h4>Dụng cụ</h4>
                      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 0, listStyle: 'none' }}>
                        {sop.toolsRequired.map((tool, index) => <li key={index} className="badge badge-info">{tool}</li>)}
                      </ul>
                    </>}
                    <h4>Các bước</h4>
                    <ol style={{ display: 'grid', gap: 10, paddingInlineStart: 28 }}>
                      {sop.steps.map((step, index) => (
                        <li key={index} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 12, overflowWrap: 'anywhere' }}>
                          <strong>{step.title}</strong>
                          {step.desc && <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{step.desc}</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 💡 SUB-TAB 3: MẸO THỰC ĐỊA */}
      {activeSubTab === 'TIPS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Kinh nghiệm xử lý thực địa được đúc kết bởi các Kỹ thuật viên Nasun Paint khi đi công tác xa.
            </p>
            <button
              disabled={!tipsHydrated}
              onClick={() => { setTipId(null); setNewTip({ title: '', author: 'KTV. Kỹ Thuật Viên', tags: '', content: '' }); setShowAddTipModal(true); }}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
            >
              <PlusCircle size={16} />
              <span>Đóng Góp Mẹo Thực Địa Mới</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {fieldTips.map((tip) => (
              <div
                key={tip.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  borderLeft: '4px solid #f59e0b'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Lightbulb size={20} color="#f59e0b" />
                    <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>
                      {tip.title}
                    </h3>
                  </div>

                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
                    <details><summary>Xem mẹo</summary><p style={{ whiteSpace: 'pre-wrap' }}>{tip.content}</p></details>
                    <button className="btn btn-secondary" disabled={!tipsHydrated} onClick={() => {
                      setTipId(tip.id);
                      setNewTip({ ...tip, tags: tip.tags.join(', ') });
                      setShowAddTipModal(true);
                    }}>Sửa</button>
                    <button className="btn btn-secondary" disabled={!tipsHydrated} onClick={() => {
                      if (window.confirm(`Xóa mẹo “${tip.title}”?`)) void saveHandbookItems('tech_handbook_field_tips', fieldTips.filter(item => item.id !== tip.id), setFieldTips);
                    }}>Xóa</button>
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {tip.tags.map((tg, idx) => (
                      <span key={idx} style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px' }}>
                        #{tg}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    <span>👤 {tip.author}</span>
                    <span>📅 {tip.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'DOCUMENTS' && <TechnicalResources />}

      {activeSubTab === 'TIPS' && storageError && <p role="alert">{storageError}</p>}
      {/* Modal Đóng góp Mẹo thực địa */}
      {showAddTipModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              background: '#0f172a',
              borderRadius: '12px'
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lightbulb color="#f59e0b" /> {tipId ? 'Sửa mẹo thực địa' : 'Thêm mẹo thực địa'}
            </h3>

            <form onSubmit={handleAddTipSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  Tiêu đề kinh nghiệm / mẹo:
                </label>
                <input
                  type="text"
                  placeholder="VD: Mẹo vệ sinh đĩa van xoay khi bị kẹt sơn khô..."
                  value={newTip.title}
                  onChange={(e) => setNewTip({ ...newTip, title: e.target.value })}
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  Tác giả (Kỹ thuật viên):
                </label>
                <input
                  type="text"
                  value={newTip.author}
                  onChange={(e) => setNewTip({ ...newTip, author: e.target.value })}
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  Thẻ gắn (phân cách bằng dấu phẩy):
                </label>
                <input
                  type="text"
                  placeholder="VD: Cổng COM, Máy chiết, Vệ sinh"
                  value={newTip.tags}
                  onChange={(e) => setNewTip({ ...newTip, tags: e.target.value })}
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  Nội dung chi tiết mẹo xử lý:
                </label>
                <textarea
                  rows={4}
                  placeholder="Mô tả cụ thể hiện tượng và các bước xử lý nhanh tại hiện trường..."
                  value={newTip.content}
                  onChange={(e) => setNewTip({ ...newTip, content: e.target.value })}
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddTipModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary">
                  Lưu mẹo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
