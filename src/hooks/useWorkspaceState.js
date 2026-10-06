import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function useWorkspaceState(name, initial) {
  const { user } = useAuth();
  const key = `nasun-view:${user?.id || 'guest'}:${name}`;
  const [value, setValue] = useState(() => {
    try { const stored = sessionStorage.getItem(key); return stored === null ? initial : JSON.parse(stored); }
    catch { return initial; }
  });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Session storage is optional. */ } }, [key, value]);
  return [value, setValue];
}

export function useWorkspaceScroll(name) {
  const { user } = useAuth();
  useEffect(() => {
    const key = `nasun-scroll:${user?.id}:${name}`;
    const container = document.querySelector('main.nasun-workspace');
    if (!container) return;
    let position = 0;
    try { position = Number(sessionStorage.getItem(key) || 0); } catch { /* Optional. */ }
    const frame = requestAnimationFrame(() => { container.scrollTop = position; });
    const remember = () => { try { sessionStorage.setItem(key, String(container.scrollTop)); } catch { /* Optional. */ } };
    container.addEventListener('scroll', remember, { passive: true });
    return () => { cancelAnimationFrame(frame); container.removeEventListener('scroll', remember); };
  }, [name, user?.id]);
}
