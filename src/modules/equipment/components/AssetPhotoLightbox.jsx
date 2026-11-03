import React from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import LazyImage from '../../../shared/components/LazyImage.jsx';

export default function AssetPhotoLightbox({ selectedPhotoViewer, setSelectedPhotoViewer }) {
  return (<>{/* FULLSCREEN PHOTO VIEWER / LIGHTBOX MODAL */}
      {selectedPhotoViewer && selectedPhotoViewer.isOpen && (
        <SafePortal>
          <div
            className="modal-overlay"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.93)',
              backdropFilter: 'blur(8px)',
              zIndex: 99999,
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            onClick={() => setSelectedPhotoViewer(null)}
          >
            <div
              style={{
                maxWidth: '92vw',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                width: '100%',
                alignItems: 'center'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Lightbox Top Header */}
              <div style={{
                width: '100%',
                maxWidth: '960px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#fff',
                padding: '10px 16px',
                background: 'rgba(15, 23, 42, 0.88)',
                borderRadius: '12px 12px 0 0',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.925rem' }}>
                    📸 {selectedPhotoViewer.title || 'Xem Ảnh Đầy Đủ'}
                  </span>
                  {selectedPhotoViewer.photos.length > 1 && (
                    <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                      {selectedPhotoViewer.activeIndex + 1} / {selectedPhotoViewer.photos.length}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a
                    href={selectedPhotoViewer.photos[selectedPhotoViewer.activeIndex]}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    title="Mở ảnh gốc trong tab mới"
                  >
                    <ExternalLink size={14} />
                    <span>Xem ảnh gốc</span>
                  </a>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 8px', borderRadius: '50%', width: '32px', height: '32px' }}
                    onClick={() => setSelectedPhotoViewer(null)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Main Image Viewport with Nav Arrows */}
              <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '960px',
                height: '65vh',
                minHeight: '360px',
                background: '#090d16',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                borderRight: '1px solid rgba(255,255,255,0.1)'
              }}>
                {selectedPhotoViewer.photos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedPhotoViewer(prev => ({
                      ...prev,
                      activeIndex: (prev.activeIndex - 1 + prev.photos.length) % prev.photos.length
                    }))}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '50%',
                      width: '42px',
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 10,
                      transition: 'background 0.2s'
                    }}
                    title="Ảnh trước (Phím mũi tên trái)"
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}

                <img
                  src={selectedPhotoViewer.photos[selectedPhotoViewer.activeIndex]}
                  alt="Ảnh chi tiết"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    userSelect: 'none',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.6)'
                  }}
                />

                {selectedPhotoViewer.photos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedPhotoViewer(prev => ({
                      ...prev,
                      activeIndex: (prev.activeIndex + 1) % prev.photos.length
                    }))}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '50%',
                      width: '42px',
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 10,
                      transition: 'background 0.2s'
                    }}
                    title="Ảnh tiếp theo (Phím mũi tên phải)"
                  >
                    <ChevronRight size={24} />
                  </button>
                )}
              </div>

              {/* Bottom Thumbnail Strip */}
              {selectedPhotoViewer.photos.length > 1 && (
                <div style={{
                  width: '100%',
                  maxWidth: '960px',
                  background: 'rgba(15, 23, 42, 0.92)',
                  padding: '10px 14px',
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  justifyContent: 'center',
                  borderRadius: '0 0 12px 12px',
                  borderTop: '1px solid rgba(255,255,255,0.1)'
                }}>
                  {selectedPhotoViewer.photos.map((pUrl, pIdx) => (
                    <div
                      key={pIdx}
                      onClick={() => setSelectedPhotoViewer(prev => ({ ...prev, activeIndex: pIdx }))}
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: pIdx === selectedPhotoViewer.activeIndex ? '2px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.2)',
                        opacity: pIdx === selectedPhotoViewer.activeIndex ? 1 : 0.5,
                        transition: 'all 0.15s ease',
                        flexShrink: 0
                      }}
                    >
                      <LazyImage src={pUrl} alt={`Thumbnail ${pIdx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SafePortal>
      )}

      </>);
}
