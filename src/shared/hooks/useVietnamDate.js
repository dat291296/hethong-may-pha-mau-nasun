import { useEffect, useState } from 'react';
import { getVietnamDate } from '../utils/dateUtils.js';

export function useVietnamDate() {
  const [today, setToday] = useState(() => getVietnamDate());
  useEffect(() => {
    const refresh = () => setToday(getVietnamDate());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}
