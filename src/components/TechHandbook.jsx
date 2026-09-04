import React, { useState, useEffect, useMemo } from 'react';
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
import SafePortal from './SafePortal';

import {
  ERROR_CODES_DATA,
  TECHNICAL_SOPS_DATA,
  FIELD_TIPS_DATA
} from '../data/troubleshootingData.js';

export default function TechHandbook({ onSelectErrorForRepair }) {
  const [activeSubTab, setActiveSubTab] = useState('ERRORS'); // 'ERRORS' | 'SOPS' | 'TIPS'

  // Error Codes with LocalStorage Persistence
  const [errorCodes, setErrorCodes] = useState(() => {
    try {
      const saved = localStorage.getItem('tech_handbook_errors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Error loading error codes from storage:', e);
    }
    return ERROR_CODES_DATA;
  });

  useEffect(() => {
    try {
      localStorage.setItem('tech_handbook_errors', JSON.stringify(errorCodes));
    } catch (e) {
      console.warn('Error saving error codes to storage:', e);
    }
  }, [errorCodes]);

  // Error Code Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [modelFilter, setModelFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [expandedErrorId, setExpandedErrorId] = useState(null);

  // Add / Edit Error Modal State
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [editingError, setEditingError] = useState(null);
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
    author: 'KTV. Kỹ Thuật Viên'
  });

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
    const term = searchTerm.toLowerCase().trim();
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
        matchesSearch = targets.some(t => String(t).toLowerCase().includes(term));
      }

      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      const matchesModel = modelFilter === 'ALL' || item.machineModel === modelFilter;
      const matchesSeverity = severityFilter === 'ALL' || item.severity === severityFilter;

      return matchesSearch && matchesCategory && matchesModel && matchesSeverity;
    });
  }, [errorCodes, searchTerm, categoryFilter, modelFilter, severityFilter]);

  const handleOpenAddError = () => {
    setEditingError(null);
    setErrorFormData({
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
      author: 'KTV. Kỹ Thuật Viên'
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
      author: err.author || 'KTV. Kỹ Thuật Viên'
    });
    setShowErrorModal(true);
  };

  const handleDeleteError = (err) => {
    if (window.confirm(`Bạn có chắc muốn xóa mã lỗi [${err.code}] ${err.title}?`)) {
      setErrorCodes(prev => prev.filter(e => e.id !== err.id));
    }
  };

  const handleResetDefaultErrors = () => {
    if (window.confirm('Khôi phục danh sách mã lỗi về mặc định ban đầu?')) {
      setErrorCodes(ERROR_CODES_DATA);
    }
  };

  const handleSaveErrorSubmit = (e) => {
    e.preventDefault();
    if (!errorFormData.code.trim() || !errorFormData.title.trim()) {
      alert('Vui lòng nhập Mã lỗi và Tên lỗi!');
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
            code: errorFormData.code.trim(),
            title: errorFormData.title.trim(),
            category: errorFormData.category,
            machineModel: errorFormData.machineModel.trim(),
            severity: errorFormData.severity,
            symptoms: symptomsArr.length > 0 ? symptomsArr : ['Chưa có thông tin dấu hiệu'],
            rootCause: errorFormData.rootCause.trim(),
            actionSteps: actionStepsArr.length > 0 ? actionStepsArr : ['Chưa có thông tin quy trình khắc phục'],
            sparePartsNeeded: errorFormData.sparePartsNeeded.trim(),
            preventiveMaintenance: errorFormData.preventiveMaintenance.trim(),
            author: errorFormData.author.trim() || 'KTV. Kỹ Thuật Viên'
          };
        }
        return item;
      }));
    } else {
      const newErr = {
        id: `ERR-${Date.now()}`,
        code: errorFormData.code.trim(),
        title: errorFormData.title.trim(),
        category: errorFormData.category,
        machineModel: errorFormData.machineModel.trim() || 'Chung',
        severity: errorFormData.severity,
        symptoms: symptomsArr.length > 0 ? symptomsArr : ['Chưa có thông tin dấu hiệu'],
        rootCause: errorFormData.rootCause.trim(),
        actionSteps: actionStepsArr.length > 0 ? actionStepsArr : ['Chưa có thông tin quy trình khắc phục'],
        sparePartsNeeded: errorFormData.sparePartsNeeded.trim(),
        preventiveMaintenance: errorFormData.preventiveMaintenance.trim(),
        author: errorFormData.author.trim() || 'KTV. Kỹ Thuật Viên'
      };
      setErrorCodes(prev => [newErr, ...prev]);
    }

    setShowErrorModal(false);
  };

  // Field Tips State
  const [fieldTips, setFieldTips] = useState(FIELD_TIPS_DATA);
  const [showAddTipModal, setShowAddTipModal] = useState(false);
  const [newTip, setNewTip] = useState({
    title: '',
    author: 'KTV. Kỹ Thuật Viên',
    tags: '',
    content: ''
  });

  // Expandable SOPs state
  const [expandedSopId, setExpandedSopId] = useState('SOP-01');



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

  const handleAddTipSubmit = (e) => {
    e.preventDefault();
    if (!newTip.title.trim() || !newTip.content.trim()) {
      alert('Vui lòng điền đầy đủ tiêu đề và nội dung mẹo thực địa!');
      return;
    }

    const createdTip = {
      id: `TIP-${Date.now()}`,
      title: newTip.title,
      author: newTip.author || 'KTV. Hiện Trường',
      date: new Date().toISOString().split('T')[0],
      tags: newTip.tags ? newTip.tags.split(',').map((t) => t.trim()) : ['Thực địa', 'Kỹ thuật'],
      content: newTip.content
    };

    setFieldTips([createdTip, ...fieldTips]);
    setShowAddTipModal(false);
    setNewTip({ title: '', author: 'KTV. Kỹ Thuật Viên', tags: '', content: '' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px' }}>
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
              <span>Quy Trình Chuẩn SOPs ({TECHNICAL_SOPS_DATA.length})</span>
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
                  <option value="Máy tính">Máy tính</option>
                  <option value="Máy in">Máy in</option>
                  <option value="Phần mềm">Phần mềm pha màu</option>
                  <option value="Khác">Khác</option>
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
                        onChange={e => setErrorFormData({ ...errorFormData, category: e.target.value })}
                      >
                        <option value="Máy chiết">Máy chiết</option>
                        <option value="Máy lắc">Máy lắc</option>
                        <option value="Máy tính">Máy tính</option>
                        <option value="Máy in">Máy in</option>
                        <option value="Phần mềm">Phần mềm</option>
                        <option value="Khác">Khác</option>
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
          {TECHNICAL_SOPS_DATA.map((sop) => {
            const isExpanded = expandedSopId === sop.id;
            return (
              <div
                key={sop.id}
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

                {isExpanded && (
                  <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Required Tools */}
                    <div style={{ background: 'rgba(6,182,212,0.06)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(6,182,212,0.2)' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                        🧰 Dụng cụ Kỹ thuật cần chuẩn bị:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {sop.toolsRequired.map((tool, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: 'rgba(15,23,42,0.6)',
                              color: '#e2e8f0',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '0.775rem',
                              border: '1px solid var(--border-color)'
                            }}
                          >
                            ✓ {tool}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Step Timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {sop.steps.map((st) => (
                        <div
                          key={st.stepNumber}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '14px',
                            background: 'rgba(15, 23, 42, 0.3)',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.05)'
                          }}
                        >
                          <div
                            style={{
                              background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
                              color: '#fff',
                              fontWeight: '900',
                              fontSize: '0.85rem',
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {st.stepNumber}
                          </div>
                          <div>
                            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)' }}>
                              {st.title}
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                              {st.desc}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
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
              onClick={() => setShowAddTipModal(true)}
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
                    "{tip.content}"
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
              <Lightbulb color="#f59e0b" /> Đóng Góp Mẹo Thực Địa Mới
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
                  Lưu & Chia Sẻ Mẹo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
