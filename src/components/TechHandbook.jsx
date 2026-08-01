import React, { useState } from 'react';
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
  Tag
} from 'lucide-react';

import {
  ERROR_CODES_DATA,
  TECHNICAL_SOPS_DATA,
  FIELD_TIPS_DATA
} from '../data/troubleshootingData.js';

export default function TechHandbook({ onSelectErrorForRepair }) {
  const [activeSubTab, setActiveSubTab] = useState('ERRORS'); // 'ERRORS' | 'SOPS' | 'TIPS'

  // Error Code Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [modelFilter, setModelFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [expandedErrorId, setExpandedErrorId] = useState(null);

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

  // Filter Error Codes
  const filteredErrors = ERROR_CODES_DATA.filter((item) => {
    const matchesSearch =
      item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.rootCause.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.symptoms.some((s) => s.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
    const matchesModel = modelFilter === 'ALL' || item.machineModel === modelFilter;
    const matchesSeverity = severityFilter === 'ALL' || item.severity === severityFilter;

    return matchesSearch && matchesCategory && matchesModel && matchesSeverity;
  });

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
              <span>Tra Cứu Mã Lỗi ({ERROR_CODES_DATA.length})</span>
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

      {/* 🔴 SUB-TAB 1: TRA CỨU MÃ LỖI */}
      {activeSubTab === 'ERRORS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Search & Filter Bar */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', gridColumn: 'span 2' }}>
                <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Tra cứu mã lỗi (E-01, E-04...), từ khóa (kẹt piston, com port, nghẹt đầu vòi...)..."
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
                  <option value="Phần mềm">Phần mềm pha màu</option>
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
                  <option value="ALL">⚙️ Tất cả Dòng Máy</option>
                  <option value="Satint A2">Satint A2</option>
                  <option value="Satint AIO">Satint AIO</option>
                  <option value="Satint A2-100">Satint A2-100</option>
                  <option value="Case máy tính">Case máy tính</option>
                  <option value="Khác / Linh kiện">Khác / Máy lắc</option>
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
              <div className="glass-panel" style={{ padding: '40px', textAlignment: 'center', color: 'var(--text-muted)' }}>
                <Info size={36} color="var(--accent-cyan)" style={{ marginBottom: '12px', opacity: 0.6 }} />
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Không tìm thấy mã lỗi phù hợp với bộ lọc!</p>
                <span style={{ fontSize: '0.8rem' }}>Thử thay đổi từ khóa hoặc đặt lại bộ lọc.</span>
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
                        userSelect: 'none'
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {onSelectErrorForRepair && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectErrorForRepair(error);
                            }}
                            className="btn btn-primary"
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
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
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
                            🔍 Dấu hiệu nhận biết thực địa:
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {error.symptoms.map((sym, idx) => (
                              <li key={idx} style={{ marginBottom: '3px' }}>{sym}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Root Cause */}
                        <div style={{ background: 'rgba(239, 68, 68, 0.06)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
                            ⚡ Nguyên nhân gốc rễ (Root Cause):
                          </span>
                          <span style={{ fontSize: '0.875rem', color: '#fca5a5' }}>
                            {error.rootCause}
                          </span>
                        </div>

                        {/* Action Steps */}
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                            🛠️ Quy trình khắc phục từng bước (Action Plan):
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {error.actionSteps.map((step, idx) => (
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

                        {/* Preventive Maintenance & Author */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', fontSize: '0.775rem', color: 'var(--text-muted)', paddingTop: '8px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={14} color="#10b981" />
                            <strong>Khuyên dùng bảo dưỡng:</strong> {error.preventiveMaintenance}
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
