import { useEffect, useState } from 'react';

function readNetworkQuality() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || 'unknown').toLowerCase();
  const slow = connection?.saveData === true || ['slow-2g', '2g'].includes(effectiveType);
  return { effectiveType, saveData: connection?.saveData === true, isSlow: slow };
}

export function useNetworkQuality() {
  const [quality, setQuality] = useState(readNetworkQuality);
  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const update = () => setQuality(readNetworkQuality());
    connection?.addEventListener?.('change', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      connection?.removeEventListener?.('change', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return quality;
}

export function networkImageUrl(source, isSlow) {
  if (!isSlow || typeof source !== 'string' || typeof window === 'undefined') return source;
  try {
    const url = new URL(source, window.location.href);
    const match = url.pathname.match(/^(.*\/storage\/v1\/)object\/(public|sign)\/(.+)$/);
    if (!match) return source;
    url.pathname = `${match[1]}render/image/${match[2]}/${match[3]}`;
    url.searchParams.set('quality', '40');
    url.searchParams.set('width', '640');
    url.searchParams.set('resize', 'contain');
    return url.toString();
  } catch {
    return source;
  }
}
