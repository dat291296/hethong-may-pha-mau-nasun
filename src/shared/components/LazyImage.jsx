import React, { useEffect, useRef, useState } from 'react';
import { networkImageUrl, useNetworkQuality } from '../hooks/useNetworkQuality.js';

export default function LazyImage({ src, alt = '', className, style, width, height, onClick, fit = 'cover', ...props }) {
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const { isSlow } = useNetworkQuality();
  useEffect(() => {
    const node = containerRef.current;
    if (!node || visible) return undefined;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <span ref={containerRef} className={className} style={{ display: 'block', width, height, aspectRatio: width && height ? `${width} / ${height}` : undefined, ...style }}>
      {visible && src ? <img src={networkImageUrl(src, isSlow)} alt={alt} loading="lazy" decoding="async" width={width} height={height} onClick={onClick} style={{ display: 'block', width: '100%', height: '100%', objectFit: fit }} {...props} /> : null}
    </span>
  );
}
